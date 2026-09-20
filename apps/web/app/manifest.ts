import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyService — Premium Repair Service',
    short_name: 'MyService',
    description: 'Servis markazlarini boshqarish',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f6f6f4',
    theme_color: '#161616',
    icons: [
      { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
