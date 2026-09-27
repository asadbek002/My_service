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
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
