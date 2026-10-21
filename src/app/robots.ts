import type { MetadataRoute } from 'next';

// Crawl preferences only. Malicious scrapers are controlled by access/rate checks.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/frequency', '/access', '/feedback', '/favorites', '/history'] } };
}
