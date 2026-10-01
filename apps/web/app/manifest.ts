import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyService — ta'mir servisi",
    short_name: 'MyService',
    description: 'Servis markazlarini boshqarish',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FAFAF9',
    theme_color: '#FAFAF9',
    // PNG first: Android install prompts and iOS need raster icons.
    // The /api/settings/icon endpoint returns the org's custom logo (or falls back to the static PNG).
    icons: [
      { src: '/api/settings/icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/settings/icon', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
