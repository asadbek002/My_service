import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const ESKIZ_BASE = 'https://notify.eskiz.uz/api';
const TOKEN_CACHE_KEY = 'eskiz:token';
const TOKEN_TTL = 3300; // 55 daqiqa (token 1 soat, buffer 5 daqiqa)

export interface EskizSendResult {
  id: string;       // SMS ID (status tekshirishda ishlatiladi)
  status: string;   // 'waiting' | 'error' | ...
}

@Injectable()
export class EskizClient implements OnModuleInit, OnModuleDestroy {
  private redis?: Redis;
  private inMemoryToken?: string; // Redis yo'q bo'lganda fallback
  private inMemoryExpiry = 0;
  private readonly logger = new Logger('EskizClient');

  async onModuleInit() {
    if (!process.env.REDIS_URL) return;
    try {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
      });
      await this.redis.connect();
    } catch {
      this.redis = undefined;
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  // Token olish (cache dan yoki yangi)
  async getToken(): Promise<string> {
    // 1. Redis cache
    if (this.redis) {
      try {
        const cached = await this.redis.get(TOKEN_CACHE_KEY);
        if (cached) return cached;
      } catch { /* Redis xatosi — keyinga */ }
    }

    // 2. In-memory cache (Redis yo'q bo'lganda)
    if (this.inMemoryToken && Date.now() < this.inMemoryExpiry) {
      return this.inMemoryToken;
    }

    // 3. Token refresh (avval sinab ko'ramiz)
    if (this.inMemoryToken) {
      try {
        const token = await this.refreshToken(this.inMemoryToken);
        await this.cacheToken(token);
        return token;
      } catch { /* Refresh ishlamasa yangi login */ }
    }

    // 4. Yangi login
    const token = await this.loginToken();
    await this.cacheToken(token);
    return token;
  }

  private async loginToken(): Promise<string> {
    const email = process.env.SMS_API_KEY;
    const password = process.env.SMS_API_SECRET;
    if (!email || !password) throw new Error('ESKIZ_CREDENTIALS_MISSING');

    const res = await fetch(ESKIZ_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      this.logger.error(`Eskiz login failed: ${res.status}`);
      throw new Error('ESKIZ_AUTH_FAILED');
    }

    const data = await res.json() as { data?: { token?: string }; status?: string };
    const token = data.data?.token;
    if (!token) throw new Error('ESKIZ_AUTH_FAILED');
    return token;
  }

  private async refreshToken(oldToken: string): Promise<string> {
    const res = await fetch(ESKIZ_BASE + '/auth/refresh', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + oldToken },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error('ESKIZ_REFRESH_FAILED');
    const data = await res.json() as { data?: { token?: string } };
    const token = data.data?.token;
    if (!token) throw new Error('ESKIZ_REFRESH_FAILED');
    return token;
  }

  private async cacheToken(token: string): Promise<void> {
    this.inMemoryToken = token;
    this.inMemoryExpiry = Date.now() + TOKEN_TTL * 1000;

    if (this.redis) {
      try {
        await this.redis.set(TOKEN_CACHE_KEY, token, 'EX', TOKEN_TTL);
      } catch { /* ignore */ }
    }
  }

  // SMS yuborish
  async send(phone: string, message: string): Promise<EskizSendResult> {
    // Telefon formatini tekshirish: +998901234567 → 998901234567
    const mobile = phone.replace(/^\+/, '');
    if (!/^\d{9,15}$/.test(mobile)) throw new Error('ESKIZ_INVALID_PHONE');

    const from = process.env.SMS_FROM ?? '4546';
    const token = await this.getToken();

    const res = await fetch(ESKIZ_BASE + '/message/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        mobile_phone: mobile,
        message,
        from,
        callback_url: '',
      }),
    });

    // Token muddati tugagan bo'lsa — yangi login, qayta urinish
    if (res.status === 401) {
      this.inMemoryToken = undefined;
      this.inMemoryExpiry = 0;
      if (this.redis) {
        try { await this.redis.del(TOKEN_CACHE_KEY); } catch { /* ignore */ }
      }
      const newToken = await this.loginToken();
      await this.cacheToken(newToken);

      const retry = await fetch(ESKIZ_BASE + '/message/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + newToken },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ mobile_phone: mobile, message, from, callback_url: '' }),
      });

      if (!retry.ok) throw new Error('ESKIZ_SEND_FAILED');
      return this.parseSendResponse(await retry.json());
    }

    if (!res.ok) {
      this.logger.error(`Eskiz SMS failed: ${res.status}`);
      throw new Error('ESKIZ_SEND_FAILED');
    }

    return this.parseSendResponse(await res.json());
  }

  // SMS status tekshirish (notification delivery confirmation uchun)
  async getStatus(smsId: string): Promise<string> {
    const token = await this.getToken();
    const res = await fetch(ESKIZ_BASE + '/message/sms/status_by_id/' + smsId, {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return 'UNKNOWN';
    const data = await res.json() as { data?: { status?: string } };
    return data.data?.status ?? 'UNKNOWN';
  }

  private parseSendResponse(data: unknown): EskizSendResult {
    const d = data as { id?: string | number; data?: { id?: string | number }; status?: string; message?: string };
    const id = String(d.id ?? d.data?.id ?? '');
    const status = d.status ?? d.message ?? 'waiting';
    if (!id) throw new Error('ESKIZ_SEND_FAILED');
    return { id, status };
  }
}
