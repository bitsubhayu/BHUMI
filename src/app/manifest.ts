import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BHUMI',
    short_name: 'BHUMI',
    description: 'Block-level monsoon onset and break prediction for Indian farmers',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F6F2',
    theme_color: '#9DBFC3',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
