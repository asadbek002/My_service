import type { MetadataRoute } from 'next';
import { INDEXNOW_KEY, SITE_URL } from '../lib/site';

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'YandexBot', 'meta-externalagent', 'DuckAssistBot'];

// Search engines and AI assistants see the home page (both languages), sign-up and the legal pages;
// the app, the platform console and customers' tracking links stay out. The most specific rule wins.
export default function robots(): MetadataRoute.Robots {
  const allow = ['/$', '/ru$', '/signup', '/login', '/install', '/terms', '/privacy', '/llms.txt', '/opengraph-image', '/icon', '/apple-touch-icon.png', `/${INDEXNOW_KEY}.txt`];
  return {
    // AI assistants' crawlers are named too: some read only the rules addressed to them.
    rules: [{ userAgent: '*', allow, disallow: ['/'] }, { userAgent: AI_BOTS, allow, disallow: ['/'] }],
    sitemap: SITE_URL + '/sitemap.xml',
    host: SITE_URL,
  };
}
