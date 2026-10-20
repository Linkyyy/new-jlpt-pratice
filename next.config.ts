import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  serverExternalPackages: ["exceljs", "pdfkit"],
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/practice": ["./src/data/imported-bank/questions/*.json"],
    "/api/practice/favorites": ["./src/data/imported-bank/questions/*.json"],
    "/api/favorites/questions": ["./src/data/imported-bank/questions/*.json"],
    "/api/feedback": ["./src/data/imported-bank/questions/*.json"],
    "/api/frequency": ["./src/data/bank-frequency/corpus.json.gz", "./src/data/imported-bank/questions/*.json"],
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
