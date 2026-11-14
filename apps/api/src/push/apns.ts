import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { Logger } from '@nestjs/common';

/**
 * Apple Push Notification service, spoken directly (HTTP/2 + a token signed with the .p8 key from
 * Apple Developer → Keys). One key works for every app of the team and never expires.
 *
 * Server .env:
 *   APNS_KEY_ID=ABC123DEFG          (the key's id)
 *   APNS_TEAM_ID=XYZ987TEAM         (Apple Developer → Membership → Team ID)
 *   APNS_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"   (the .p8 file; \n or base64 also work)
 *   APNS_TOPIC=uz.myserviceuz.app   (the app's bundle id; default)
 *   APNS_HOST=https://api.push.apple.com   (default; https://api.sandbox.push.apple.com for Xcode debug builds)
 */
export type ApnsConfig = { keyId: string; teamId: string; key: KeyObject; topic: string; host: string };

export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim(), teamId = env.APNS_TEAM_ID?.trim(), raw = env.APNS_KEY?.trim();
  if (!keyId || !teamId || !raw) return null;
  let pem = raw.replace(/\\n/g, '\n');
  if (!pem.includes('BEGIN')) pem = Buffer.from(pem, 'base64').toString('utf8');
  const host = (env.APNS_HOST || 'https://api.push.apple.com').replace(/\/$/, '');
  // Plain HTTP only for the tests' local fake server.
  if (!host.startsWith('https://') && !(env.NODE_ENV === 'test' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))) throw new Error('APNS_HOST must be https');
  return { keyId, teamId, key: createPrivateKey(pem), topic: env.APNS_TOPIC?.trim() || 'uz.myserviceuz.app', host };
}

/** The provider token: a JWT signed with ES256. Apple wants it renewed between 20 and 60 minutes. */
export function apnsJwt(keyId: string, teamId: string, key: KeyObject, now = Date.now()) {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = part({ alg: 'ES256', kid: keyId }) + '.' + part({ iss: teamId, iat: Math.floor(now / 1000) });
  return unsigned + '.' + sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

export type PushMessage = { title: string; body: string; url?: string; threadId?: string };
export type ApnsResult = { status: number; reason?: string | undefined };

/** What Apple gets: the alert, the default sound, and our own "url" key (the screen to open on tap). */
export function apnsPayload(m: PushMessage) {
  return { aps: { alert: { title: m.title, body: m.body }, sound: 'default', ...(m.threadId ? { 'thread-id': m.threadId } : {}) }, ...(m.url ? { url: m.url } : {}) };
}

export class Apns {
  private session: ClientHttp2Session | undefined;
  private jwt: { value: string; at: number } | undefined;
  private readonly logger = new Logger('APNs');
  constructor(private readonly config: ApnsConfig) {}

  private token() {
    if (!this.jwt || Date.now() - this.jwt.at > 40 * 60_000) this.jwt = { value: apnsJwt(this.config.keyId, this.config.teamId, this.config.key), at: Date.now() };
    return this.jwt.value;
  }

  private connection() {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = connect(this.config.host);
    session.on('error', e => { this.logger.warn('APNs connection: ' + e.message); });
    session.on('close', () => { if (this.session === session) this.session = undefined; });
    // Do not keep the process alive just for this connection.
    session.unref();
    this.session = session;
    return session;
  }

  send(deviceToken: string, message: PushMessage): Promise<ApnsResult> {
    return new Promise(resolve => {
      const body = JSON.stringify(apnsPayload(message));
      let req;
      try {
        req = this.connection().request({
          [constants.HTTP2_HEADER_METHOD]: 'POST',
          [constants.HTTP2_HEADER_PATH]: '/3/device/' + deviceToken,
          authorization: 'bearer ' + this.token(),
          'apns-topic': this.config.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        });
      } catch (e) { resolve({ status: 0, reason: (e as Error).message }); return; }
      let status = 0, raw = '';
      req.setTimeout(10_000, () => { req.close(constants.NGHTTP2_CANCEL); resolve({ status: 0, reason: 'TIMEOUT' }); });
      req.on('response', h => { status = Number(h[constants.HTTP2_HEADER_STATUS]); });
      req.setEncoding('utf8');
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        let reason: string | undefined;
        try { reason = raw ? (JSON.parse(raw) as { reason?: string }).reason : undefined; } catch { reason = raw.slice(0, 100); }
        resolve({ status, reason });
      });
      req.on('error', e => resolve({ status: 0, reason: e.message }));
      req.end(body);
    });
  }

  close() { this.session?.close(); }
}

/** Apple says this token will never work again: forget it. */
export const deadToken = (r: ApnsResult) => r.status === 410 || (r.status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(r.reason ?? ''));
