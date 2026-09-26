import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Heavy',
    short_name: 'Heavy',
    description: 'Log every set, track every gain.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f1ea',
    theme_color: '#f4f1ea',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
