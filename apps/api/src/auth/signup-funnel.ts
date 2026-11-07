import { Logger } from '@nestjs/common';
import type { Database } from '../database';

export type SignupStage = 'CODE_SENT' | 'VERIFIED' | 'COMPLETED';
const RANK: Record<SignupStage, number> = { CODE_SENT: 1, VERIFIED: 2, COMPLETED: 3 };
const logger = new Logger('SignupFunnel');

/**
 * Notes a step of someone's self sign-up against their phone, for the platform console: the furthest
 * stage reached, how it was confirmed, and the last error that stopped them. Never fails the sign-up.
 */
export async function trackSignup(db: Database, phone: string, step: {
  stage?: SignupStage; method?: 'SMS' | 'TELEGRAM'; codeSent?: boolean; wrongCode?: boolean;
  error?: string; serviceName?: string; login?: string; organizationId?: string;
}) {
  try {
    const before = await db.signupAttempt.findUnique({ where: { phone }, select: { stage: true } });
    const stage = step.stage && (!before || RANK[step.stage] > RANK[before.stage as SignupStage]) ? step.stage : undefined;
    const data = {
      ...(stage ? { stage } : {}),
      ...(step.method ? { method: step.method } : {}),
      ...(step.serviceName ? { serviceName: step.serviceName.slice(0, 100) } : {}),
      ...(step.login ? { login: step.login.slice(0, 64) } : {}),
      ...(step.organizationId ? { organizationId: step.organizationId } : {}),
      // A step that went through clears the old error; a failed one records its own.
      ...(step.error ? { lastError: step.error.slice(0, 100), lastErrorAt: new Date() } : step.stage ? { lastError: null, lastErrorAt: null } : {}),
    };
    await db.signupAttempt.upsert({
      where: { phone },
      create: { phone, stage: step.stage ?? 'CODE_SENT', ...data, codesSent: step.codeSent ? 1 : 0, wrongCodes: step.wrongCode ? 1 : 0 },
      update: { ...data, ...(step.codeSent ? { codesSent: { increment: 1 } } : {}), ...(step.wrongCode ? { wrongCodes: { increment: 1 } } : {}) },
    });
  } catch (e) {
    logger.warn('Sign-up step not recorded: ' + (e instanceof Error ? e.message : 'unknown'));
  }
}

/** The error code an API exception carries ('CODE_WRONG', 'LOGIN_TAKEN', ...), for the funnel. */
export function errorCode(e: unknown) {
  const r = (e as { getResponse?: () => unknown })?.getResponse?.();
  const m = typeof r === 'object' && r && 'message' in r ? (r as { message: unknown }).message : (e as Error)?.message;
  return Array.isArray(m) ? 'INVALID_INPUT' : typeof m === 'string' ? m : 'UNKNOWN';
}
