import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyService — ta'mir servisi",
    short_name: 'MyService',
    description: 'Servis markazlarini boshqarish',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#EEF2F1',
    theme_color: '#EEF2F1',
    // Signed-in pages swap this for the workshop's own manifest (its logo as the icon), see AppShell.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
