import metadata from '@/data/bank-frequency/manifest.json';
import { FrequencyInputError, parseFrequencyFilters, queryFrequency } from '@/lib/bank-frequency.mjs';
import { loadFrequencyCorpus } from '@/lib/bank-frequency.server';
import { apiErrorResponse, checkApiRateLimit } from '@/lib/request-limits';

export async function GET(request: Request) {
  const denied = checkApiRateLimit(request, { scope: 'bank-frequency', limit: 60, windowSeconds: 60 });
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    if (url.search.length > 2000) throw new FrequencyInputError('统计筛选条件无效。');
    const filters = parseFrequencyFilters(url.searchParams, metadata);
    const term = url.searchParams.get('term');
    if (term !== null && !/^\d{1,6}$/.test(term)) throw new FrequencyInputError('统计筛选条件无效。');
    const corpus = await loadFrequencyCorpus();
    if (term !== null && Number(term) >= corpus.terms.length) throw new FrequencyInputError('统计筛选条件无效。');
    return Response.json(queryFrequency(corpus, filters, term === null ? undefined : Number(term)), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof FrequencyInputError) return Response.json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return apiErrorResponse(error);
  }
}
