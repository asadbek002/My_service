import { BadRequestException, Global, HttpException, Injectable, Logger, Module, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import Redis from 'ioredis';
import { EskizClient } from '../notifications/eskiz.client';

/** What a verified phone may be used for. A proof for one purpose never works for the other. */
export type VerifyPurpose = 'signup' | 'reset';
export const VERIFY_PURPOSES: VerifyPurpose[] = ['signup', 'reset'];

const CODE_TTL = 600;         // an SMS code lives 10 minutes
const CODE_ATTEMPTS = 5;      // wrong guesses before the code is burnt
const RESEND_AFTER = 60;      // seconds between two SMS to one number
const SMS_PER_PHONE_HOUR = 5;
const SMS_PER_IP_HOUR = 20;
const TELEGRAM_TTL = 900;     // a Telegram confirmation link lives 15 minutes
const PROOF_TTL = 1800;       // after verifying, 30 minutes to finish the form

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const token = () => randomBytes(32).toString('base64url');
type TelegramState = { purpose: VerifyPurpose; status: 'pending' | 'verified'; phone?: string };

/**
 * Proves that a person controls a phone number, before self sign-up or a password reset.
 * Two ways: a 6-digit SMS code, or sharing the Telegram contact with the bot (free, works while
 * Eskiz is in test mode). Either ends in a single-use proof token that /auth/signup and /auth/reset take.
 */
@Injectable()
export class PhoneVerification implements OnModuleDestroy {
  private readonly logger = new Logger('PhoneVerification');
  private readonly redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
  constructor(private readonly eskiz: EskizClient) {}
  async onModuleDestroy() { await this.redis.quit(); }

  private smsConfigured() { return !!(process.env.SMS_API_KEY || process.env.ESKIZ_EMAIL); }
  /** Tests, and local development without Eskiz, get the code in the response instead of an SMS. */
  private showCode() { return process.env.NODE_ENV === 'test' || (process.env.NODE_ENV !== 'production' && !this.smsConfigured()); }

  private async count(key: string, ttl: number) {
    const n = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, ttl));
    return n;
  }

  /**
   * `deliver: false` answers exactly like a sent code but sends nothing (a reset for a number with
   * no account): no SMS cost, and the reply does not tell whether the number has an account.
   */
  async sendSms(purpose: VerifyPurpose, phone: string, ip: string, deliver = true) {
    if (!/^\+998\d{9}$/.test(phone)) throw new BadRequestException('SMS faqat O‘zbekiston raqamlariga yuboriladi');
    if (await this.redis.exists(`pv:cool:${purpose}:${phone}`)) throw new HttpException('RESEND_TOO_SOON', 429);
    if (await this.count(`pv:n:${sha(phone)}`, 3600) > SMS_PER_PHONE_HOUR || await this.count(`pv:ip:${sha(ip)}`, 3600) > SMS_PER_IP_HOUR) throw new HttpException('TOO_MANY_CODES', 429);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!deliver) {
      await this.redis.set(`pv:cool:${purpose}:${phone}`, '1', 'EX', RESEND_AFTER);
      return { sent: true, resendAfter: RESEND_AFTER };
    }
    if (!this.showCode()) {
      if (!this.smsConfigured()) throw new ServiceUnavailableException('SMS_UNAVAILABLE');
      try { await this.eskiz.send(phone, `MyService: tasdiqlash kodi ${code}. Kodni hech kimga bermang.`); }
      catch (e) {
        this.logger.warn('Verification SMS failed: ' + (e instanceof Error ? e.message : 'unknown'));
        throw new ServiceUnavailableException('SMS_UNAVAILABLE');
      }
    }
    await this.redis.set(`pv:code:${purpose}:${phone}`, JSON.stringify({ hash: sha(code), attempts: 0 }), 'EX', CODE_TTL);
    await this.redis.set(`pv:cool:${purpose}:${phone}`, '1', 'EX', RESEND_AFTER);
    return { sent: true, resendAfter: RESEND_AFTER, ...(this.showCode() ? { devCode: code } : {}) };
  }

  async checkSms(purpose: VerifyPurpose, phone: string, code: string) {
    const key = `pv:code:${purpose}:${phone}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('CODE_EXPIRED');
    const state = JSON.parse(raw) as { hash: string; attempts: number };
    const good = timingSafeEqual(Buffer.from(state.hash), Buffer.from(sha(code)));
    if (!good) {
      if (state.attempts + 1 >= CODE_ATTEMPTS) await this.redis.del(key);
      else await this.redis.set(key, JSON.stringify({ ...state, attempts: state.attempts + 1 }), 'KEEPTTL');
      throw new BadRequestException('CODE_WRONG');
    }
    await this.redis.del(key);
    return this.issueProof(purpose, phone);
  }

  /** A t.me link; the person opens it, shares their contact, and the app polls telegramStatus. */
  async startTelegram(purpose: VerifyPurpose) {
    const t = token();
    await this.redis.set(`pv:tg:${t}`, JSON.stringify({ purpose, status: 'pending' } satisfies TelegramState), 'EX', TELEGRAM_TTL);
    return t;
  }
  async telegramStatus(t: string) {
    const raw = await this.redis.get(`pv:tg:${t}`);
    if (!raw) throw new BadRequestException('LINK_EXPIRED');
    const state = JSON.parse(raw) as TelegramState;
    if (state.status !== 'verified' || !state.phone) return { verified: false as const };
    // Hand the proof out once: the link cannot be polled into a second proof.
    if (!await this.redis.del(`pv:tg:${t}`)) return { verified: false as const };
    return { verified: true as const, phone: state.phone, proof: await this.issueProof(state.purpose, state.phone) };
  }

  // ---- Bot side ----
  /** /start v_<token>: remember which link this chat is answering. False when the link is gone. */
  async telegramOpened(t: string, chatId: string) {
    if (!await this.redis.exists(`pv:tg:${t}`)) return false;
    await this.redis.set(`pv:chat:${chatId}`, t, 'EX', TELEGRAM_TTL);
    return true;
  }
  /** The chat shared its own contact: mark its pending link verified. Null when nothing is pending. */
  async telegramContact(chatId: string, phone: string) {
    const t = await this.redis.get(`pv:chat:${chatId}`);
    if (!t) return null;
    await this.redis.del(`pv:chat:${chatId}`);
    const raw = await this.redis.get(`pv:tg:${t}`);
    if (!raw) return null;
    const state = JSON.parse(raw) as TelegramState;
    await this.redis.set(`pv:tg:${t}`, JSON.stringify({ ...state, status: 'verified', phone } satisfies TelegramState), 'KEEPTTL');
    return state.purpose;
  }

  // ---- Proofs ----
  private async issueProof(purpose: VerifyPurpose, phone: string) {
    const p = token();
    await this.redis.set(`pv:proof:${sha(p)}`, JSON.stringify({ purpose, phone }), 'EX', PROOF_TTL);
    return p;
  }
  /** The verified phone behind a proof, without using it up (to check the form before creating anything). */
  async peek(proof: string, purpose: VerifyPurpose) {
    const raw = typeof proof === 'string' && proof.length <= 64 ? await this.redis.get(`pv:proof:${sha(proof)}`) : null;
    const state = raw ? JSON.parse(raw) as { purpose: VerifyPurpose; phone: string } : null;
    if (!state || state.purpose !== purpose) throw new BadRequestException('PHONE_NOT_VERIFIED');
    return state.phone;
  }
  /** Use a proof up; a second request with the same proof fails. */
  async consume(proof: string, purpose: VerifyPurpose) {
    const phone = await this.peek(proof, purpose);
    if (!await this.redis.del(`pv:proof:${sha(proof)}`)) throw new BadRequestException('PHONE_NOT_VERIFIED');
    return phone;
  }
}

@Global()
@Module({ providers: [PhoneVerification, EskizClient], exports: [PhoneVerification] })
export class VerificationModule {}
