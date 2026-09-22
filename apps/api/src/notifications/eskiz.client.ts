import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const ESKIZ_BASE = 'https://notify.eskiz.uz/api';
const TOKEN_CACHE_KEY = 'eskiz:token';
const TOKEN_TTL = 86400; // 24 soat (Eskiz JWT 30 kun amal qiladi, 24 soat kesh yetarli)

export interface EskizSendResult {
  id: string; // SMS ID (status tekshirishda yoki request_id)
  status: string; // 'waiting' | 'DELIVERED' | 'TRANSMTD' | 'FAILED' ...
  message?: string;
}

export interface EskizUserLimit {
  balance: number;
  smsCount: number;
}

export interface EskizPrice {
  country_id: number;
  country: string;
  price: number;
  net_price: number;
}

@Injectable()
export class EskizClient implements OnModuleInit, OnModuleDestroy {
  private redis?: Redis;
  private inMemoryToken: string | undefined = undefined;
  private inMemoryExpiry = 0;
  private readonly logger = new Logger('EskizClient');

  async onModuleInit() {
    if (!process.env.REDIS_URL) return;
    try {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      await this.redis.connect();
    } catch {
      // Redis ulanmasa in-memory fallback ishlaydi
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  /**
   * Eskiz Bearer token olish (Keshdan yoki yangi login orqali)
   */
  async getToken(): Promise<string> {
    // 1. Redis keshini tekshirish
    if (this.redis) {
      try {
        const cached = await this.redis.get(TOKEN_CACHE_KEY);
        if (cached) return cached;
      } catch {
        // Redis xatosi yuz bersa in-memoryga o'tadi
      }
    }

    // 2. In-memory kesh
    if (this.inMemoryToken && Date.now() < this.inMemoryExpiry) {
      return this.inMemoryToken;
    }

    // 3. Mavjud tokenni yangilashga urinib ko'rish
    if (this.inMemoryToken) {
      try {
        const refreshed = await this.refreshToken(this.inMemoryToken);
        await this.cacheToken(refreshed);
        return refreshed;
      } catch {
        // Refresh ishlamasa, yangi login qiladi
      }
    }

    // 4. Yangi login qilish
    const token = await this.loginToken();
    await this.cacheToken(token);
    return token;
  }

  /**
   * POST /api/auth/login — Yangi Bearer token olish
   */
  private async loginToken(): Promise<string> {
    const email = process.env.SMS_API_KEY || process.env.ESKIZ_EMAIL;
    const password = process.env.SMS_API_SECRET || process.env.ESKIZ_PASSWORD;

    if (!email || !password) {
      throw new Error('ESKIZ_CREDENTIALS_MISSING');
    }

    const formData = new URLSearchParams();
    formData.append('email', email);
    formData.append('password', password);

    const res = await fetch(`${ESKIZ_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: formData.toString(),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      this.logger.error(`Eskiz login failed (${res.status}): ${errorText}`);
      throw new Error('ESKIZ_AUTH_FAILED');
    }

    const data = (await res.json()) as {
      message?: string;
      data?: { token?: string };
      token_type?: string;
    };

    const token = data.data?.token;
    if (!token) {
      throw new Error('ESKIZ_AUTH_FAILED');
    }

    return token;
  }

  /**
   * PATCH /api/auth/refresh — Tokenni yangilash
   */
  private async refreshToken(oldToken: string): Promise<string> {
    const res = await fetch(`${ESKIZ_BASE}/auth/refresh`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${oldToken}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error('ESKIZ_REFRESH_FAILED');
    }

    const data = (await res.json()) as {
      data?: { token?: string };
    };

    const token = data.data?.token;
    if (!token) {
      throw new Error('ESKIZ_REFRESH_FAILED');
    }

    return token;
  }

  private async cacheToken(token: string): Promise<void> {
    this.inMemoryToken = token;
    this.inMemoryExpiry = Date.now() + TOKEN_TTL * 1000;

    if (this.redis) {
      try {
        await this.redis.set(TOKEN_CACHE_KEY, token, 'EX', TOKEN_TTL);
      } catch {
        // ignore redis caching errors
      }
    }
  }

  /**
   * POST /api/message/sms/send — SMS yuborish
   * @param phone - Mijoz telefon raqami (+998901234567 yoki 998901234567)
   * @param message - SMS matni
   */
  async send(phone: string, message: string): Promise<EskizSendResult> {
    // Telefon raqamini tozalash: +998901234567 -> 998901234567
    const mobile = phone.replace(/\D/g, '');
    if (!/^\d{9,15}$/.test(mobile)) {
      throw new Error('ESKIZ_INVALID_PHONE');
    }

    const from = process.env.SMS_FROM || process.env.ESKIZ_FROM || '4546';
    const callbackUrl = process.env.ESKIZ_CALLBACK_URL || '';

    // Test rejimida bo'lsa, Eskiz talabiga binoan test matnidan foydalanish mumkin
    let finalMessage = message;
    if (process.env.ESKIZ_TEST_MODE === 'true' && !message.includes('Eskiz')) {
      finalMessage = `Bu Eskiz dan test: ${message}`;
    }

    const token = await this.getToken();

    const formData = new URLSearchParams();
    formData.append('mobile_phone', mobile);
    formData.append('message', finalMessage);
    formData.append('from', from);
    if (callbackUrl) {
      formData.append('callback_url', callbackUrl);
    }

    let res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(15000),
      body: formData.toString(),
    });

    // 401 Unauthorized bo'lsa — keshni tozalab, qayta login qilib urinish
    if (res.status === 401) {
      this.inMemoryToken = undefined;
      this.inMemoryExpiry = 0;
      if (this.redis) {
        try {
          await this.redis.del(TOKEN_CACHE_KEY);
        } catch {
          // ignore
        }
      }

      const newToken = await this.loginToken();
      await this.cacheToken(newToken);

      res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${newToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(15000),
        body: formData.toString(),
      });
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      this.logger.error(`Eskiz SMS send failed (${res.status}): ${errorBody}`);
      throw new Error('ESKIZ_SEND_FAILED');
    }

    const responseJson = await res.json();
    return this.parseSendResponse(responseJson);
  }

  /**
   * GET /api/message/sms/status_by_id/:id — SMS holatini tekshirish
   * @param smsId - Eskiz SMS ID yoki UUID request_id
   */
  async getStatus(smsId: string): Promise<string> {
    const token = await this.getToken();
    const res = await fetch(`${ESKIZ_BASE}/message/sms/status_by_id/${encodeURIComponent(smsId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return 'UNKNOWN';

    const json = (await res.json()) as {
      status?: string;
      data?: {
        id?: number;
        status?: string; // 'DELIVERED' | 'DELIVRD' | 'TRANSMTD' | 'EXPIRED' | 'REJECTD' ...
      };
    };

    return json.data?.status ?? json.status ?? 'UNKNOWN';
  }

  /**
   * GET /api/user/get-limit — Foydalanuvchi hisobidagi qolgan SMS miqdorini olish
   */
  async getUserLimit(): Promise<{ balance: number; smsCount: number }> {
    const token = await this.getToken();
    const res = await fetch(`${ESKIZ_BASE}/user/get-limit`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { balance: 0, smsCount: 0 };
    }

    const json = (await res.json()) as {
      data?: {
        balance?: number;
        sms_count?: number;
      };
    };

    return {
      balance: json.data?.balance ?? 0,
      smsCount: json.data?.sms_count ?? 0,
    };
  }

  /**
   * GET /api/user/prices — SMS narxlari tariflarini olish
   */
  async getPrices(): Promise<EskizPrice[]> {
    const token = await this.getToken();
    const res = await fetch(`${ESKIZ_BASE}/user/prices`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: EskizPrice[];
    };

    return json.data ?? [];
  }

  /**
   * POST /api/report/total-by-dispatch?status — Rassilka bo'yicha xarajatlar hisoboti
   */
  async getDispatchReport(dispatchId: string, isAd = '', status = ''): Promise<any> {
    const token = await this.getToken();
    const query = status ? `?status=${encodeURIComponent(status)}` : '';

    const formData = new URLSearchParams();
    formData.append('dispatch_id', dispatchId);
    formData.append('is_ad', isAd);

    const res = await fetch(`${ESKIZ_BASE}/report/total-by-dispatch${query}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: AbortSignal.timeout(10000),
      body: formData.toString(),
    });

    if (!res.ok) return null;
    return res.json();
  }

  private parseSendResponse(data: unknown): EskizSendResult {
    const d = data as {
      id?: string | number;
      data?: { id?: string | number };
      status?: string;
      message?: string;
    };

    const id = String(d.id ?? d.data?.id ?? '');
    const status = d.status ?? d.message ?? 'waiting';

    if (!id) {
      throw new Error('ESKIZ_SEND_FAILED');
    }

    return { id, status, message: d.message };
  }
}
