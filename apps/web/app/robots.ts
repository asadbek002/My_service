import type { MetadataRoute } from 'next';

// Search engines see the home page, sign-up and the legal pages; the app, the platform console and
// customers' tracking links stay out of results. The most specific rule wins, so the allows beat "/".
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/$', '/signup', '/login', '/install', '/terms', '/privacy'], disallow: ['/'] } };
}
