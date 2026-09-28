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
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
