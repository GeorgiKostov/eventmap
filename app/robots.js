import { publicBaseUrl, publicUrl } from '../lib/public-url.js';

const BASE_URL = publicBaseUrl();

export default function robots() {
  const publicRules = {
    allow: ['/', '/api/events'],
    disallow: ['/api/', '/admin/'],
    crawlDelay: 10,
  };

  return {
    rules: [
      { userAgent: '*', ...publicRules },
      // Named groups replace the wildcard rules, so retain the same policy.
      { userAgent: 'AhrefsBot', ...publicRules },
    ],
    sitemap: publicUrl('sitemap.xml'),
    host: BASE_URL,
  };
}
