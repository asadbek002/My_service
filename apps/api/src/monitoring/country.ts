import { readFileSync } from 'node:fs';
import { Reader, type Response } from 'mmdb-lib';

/**
 * Country of an IP address, looked up on this server in the DB-IP Lite database (CC BY 4.0, https://db-ip.com),
 * shipped as the npm package @ip-location-db/dbip-country-mmdb. Nothing is sent anywhere and IPs are not kept:
 * only the two-letter country code is counted. Unknown or private addresses give null.
 */
let reader: Reader<Response> | null | undefined;
const cache = new Map<string, string | null>();

function db() {
  if (reader !== undefined) return reader;
  try { reader = new Reader(readFileSync(require.resolve('@ip-location-db/dbip-country-mmdb/dbip-country.mmdb'))); }
  catch { reader = null; }
  return reader;
}

export function countryOf(ip: string | undefined): string | null {
  if (!ip) return null;
  const clean = ip.replace(/^::ffff:/, '');
  if (cache.has(clean)) return cache.get(clean)!;
  let code: string | null = null;
  try { const c = (db()?.get(clean) as { country_code?: string } | null | undefined)?.country_code; code = c && /^[A-Z]{2}$/.test(c) ? c : null; } catch { code = null; }
  if (cache.size > 5000) cache.clear();
  cache.set(clean, code);
  return code;
}
