import { publicBaseUrl, publicUrl } from '../lib/public-url.js';

const BASE_URL = publicBaseUrl();

export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/events'],
      disallow: ['/api/', '/admin/'],
    },
    sitemap: publicUrl('sitemap.xml'),
    host: BASE_URL,
  };
}
