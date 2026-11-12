/**
 * Digital Asset Links for the Google Play app (a Trusted Web Activity of this site): Android shows the
 * site full-screen, without a browser bar, only when this file names the app and its signing key.
 * Set on the server (.env): ANDROID_PACKAGE=uz.myserviceuz.app and ANDROID_SHA256=AA:BB:… (Play Console →
 * App integrity → App signing key certificate; several keys separated by commas).
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = (process.env.ANDROID_PACKAGE || '').trim();
  const keys = (process.env.ANDROID_SHA256 || '').split(',').map(k => k.trim().toUpperCase()).filter(k => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(k));
  const body = pkg && keys.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: keys } }] : [];
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
