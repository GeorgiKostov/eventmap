/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  // Ensure the seeded SQLite file ships inside the serverless function bundle
  // (it is read at runtime by path, which the tracer won't catch on its own).
  outputFileTracingIncludes: {
    '/**': ['./data/umkreis.db'],
  },
};

export default nextConfig;
