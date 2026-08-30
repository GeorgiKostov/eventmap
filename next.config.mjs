const commonSecurityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // SEO landing pages are pre-rendered from the remote Supabase pool. Keep
    // build workers below its five-connection ceiling instead of fanning every
    // city/month combination out at once.
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 1000,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: commonSecurityHeaders,
      },
      {
        // Keep interactive product and account surfaces out of frames. The
        // fictional partner showcase is intentionally embeddable sales media.
        source: '/:path((?!partners(?:$|/)).*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/partners/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *; object-src 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
