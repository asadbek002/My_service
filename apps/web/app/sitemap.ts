import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

// The public pages, with the home page in both languages linked to each other.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const home = { uz: SITE_URL + '/', ru: SITE_URL + '/ru' };
  return [
    { url: home.uz, lastModified: now, changeFrequency: 'weekly', priority: 1, alternates: { languages: home } },
    { url: home.ru, lastModified: now, changeFrequency: 'weekly', priority: 0.9, alternates: { languages: home } },
    { url: SITE_URL + '/signup', lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: SITE_URL + '/install', lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: SITE_URL + '/login', lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: SITE_URL + '/terms', lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: SITE_URL + '/privacy', lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
