import { publicBaseUrl, publicUrl } from '../lib/public-url.js';

const BASE_URL = publicBaseUrl();

export default function robots() {
  const publicRules = {
    allow: ['/', '/api/events'],
    disallow: ['/api/', '/admin/'],
  };

  return {
    rules: [
      { userAgent: '*', ...publicRules },
      // Named groups replace the wildcard rules, so retain the same exclusions.
      { userAgent: 'AhrefsBot', ...publicRules, crawlDelay: 10 },
    ],
    sitemap: publicUrl('sitemap.xml'),
    host: BASE_URL,
  };
}
