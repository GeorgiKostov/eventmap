/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // SEO landing pages are pre-rendered from the remote Supabase pool. Keep
    // build workers below its five-connection ceiling instead of fanning every
    // city/month combination out at once.
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 1000,
  },
};

export default nextConfig;
