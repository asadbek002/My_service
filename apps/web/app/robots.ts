import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

// Search engines and AI assistants see the home page (both languages), sign-up and the legal pages;
// the app, the platform console and customers' tracking links stay out. The most specific rule wins.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/$', '/ru$', '/signup', '/login', '/install', '/terms', '/privacy', '/llms.txt', '/opengraph-image', '/icon', '/apple-touch-icon.png'], disallow: ['/'] },
    sitemap: SITE_URL + '/sitemap.xml',
    host: SITE_URL,
  };
}
