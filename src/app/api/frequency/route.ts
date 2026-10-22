import metadata from '@/data/bank-frequency/manifest.json';
import { FrequencyInputError, parseFrequencyDetailOptions, parseFrequencyFilters, queryFrequency } from '@/lib/bank-frequency.mjs';
import {frequencyExamplePreview} from '@/lib/frequency-evidence.mjs';
import { loadFavoriteQuestions } from '@/data/imported-papers.server';
import { parseTermStudyKey } from '@/lib/term-study-data';
import { findFrequencyTerm, loadFrequencyCorpus } from '@/lib/bank-frequency.server';
import { apiErrorResponse, checkApiRateLimit } from '@/lib/request-limits';
import { checkFrequencyAccess } from '@/lib/frequency-access.server';

export async function GET(request: Request) {
  const access = checkFrequencyAccess(request);
  if (access) return access;
  const denied = checkApiRateLimit(request, { scope: 'bank-frequency', limit: 60, windowSeconds: 60 });
  if (denied) return denied;
  const hourly = checkApiRateLimit(request, { scope: 'bank-frequency-hour', limit: 1200, windowSeconds: 3600 });
  if (hourly) return hourly;
  try {
    const url = new URL(request.url);
    if (url.search.length > 2000) throw new FrequencyInputError('统计筛选条件无效。');
    const filters = parseFrequencyFilters(url.searchParams, metadata);
    const term = url.searchParams.get('term');
    if (term !== null && !/^\d{1,6}$/.test(term)) throw new FrequencyInputError('统计筛选条件无效。');
    const corpus = await loadFrequencyCorpus();
    if (term !== null && Number(term) >= corpus.terms.length) throw new FrequencyInputError('统计筛选条件无效。');
    const entry = url.searchParams.get('entry');
    const identity = entry === null ? null : parseTermStudyKey(entry);
    if (entry !== null && !identity) throw new FrequencyInputError('统计筛选条件无效。');
    const selectedId = identity ? findFrequencyTerm(corpus, identity) : term === null ? undefined : Number(term);
    const result = queryFrequency(corpus, filters, selectedId, parseFrequencyDetailOptions(url.searchParams, corpus));
    if (result.detail) {
      result.detail.review=corpus.termReview?.[result.detail.id];
      result.detail.referenceEvidence=corpus.referenceEvidence?.[result.detail.id]??[];
      const forms=[result.detail.label,...(result.detail.aliases??[]),...(corpus.surfaceForms?.[result.detail.id]??[])];
      const records = await loadFavoriteQuestions(result.detail.examples.filter(example => example.available).map(example => example.id));
      const questions = new Map(records.map(record => [record.question.id, record.question]));
      result.detail.examples = result.detail.examples.map(example => {
        const question = questions.get(example.id);
        if (!question) return example;
        return { ...example, preview:frequencyExamplePreview(question,example.fields,forms)};
      });
    }
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof FrequencyInputError) return Response.json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return apiErrorResponse(error);
  }
}
