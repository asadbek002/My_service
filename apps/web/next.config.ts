import path from 'node:path';
import type { NextConfig } from 'next';

// The API's origin (another port in development, the same site in production) may be fetched and its images shown.
const api = (() => { try { return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').origin; } catch { return ''; } })();

// Security headers for every page. Scripts stay 'unsafe-inline' (Next's own inline scripts, JSON-LD, the language
// script in <head>); what CSP adds here is no framing (clickjacking), no plugins, no foreign forms or fetches.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${api}`,
  "font-src 'self' data:",
  // data:/blob: — the receipt picture (html-to-image reads fonts and images through fetch).
  `connect-src 'self' data: blob: ${api}`,
  `manifest-src 'self' ${api}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Trace from the monorepo root so workspace packages end up in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // The camera is used for intake photos; nothing else is asked for.
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      ],
    }];
  },
};
export default nextConfig;
