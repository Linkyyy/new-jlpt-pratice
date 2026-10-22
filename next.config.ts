import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        // A baseline policy compatible with Next's inline bootstrap and direct R2 media.
        { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
      ] },
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, nosnippet' }] },
      { source: '/frequency/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, nosnippet' }] },
    ];
  },
  serverExternalPackages: ["exceljs", "pdfkit"],
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/practice": ["./src/data/imported-bank/questions/*.json"],
    "/api/practice/favorites": ["./src/data/imported-bank/questions/*.json"],
    "/api/favorites/questions": ["./src/data/imported-bank/questions/*.json"],
    "/api/feedback": ["./src/data/imported-bank/questions/*.json", "./src/data/bank-frequency/corpus.json.gz"],
    "/api/feedback/quality": ["./src/data/bank-frequency/corpus.json.gz"],
    "/api/frequency": ["./src/data/bank-frequency/corpus.json.gz", "./src/data/imported-bank/questions/*.json"],
    "/api/frequency/feedback": ["./src/data/bank-frequency/corpus.json.gz", "./src/data/imported-bank/questions/*.json"],
    "/api/frequency/export": ["./src/data/bank-frequency/corpus.json.gz", "./src/data/export-fonts/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
