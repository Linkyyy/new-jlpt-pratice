import metadata from '@/data/bank-frequency/manifest.json';
import { FrequencyInputError, frequencyText, listeningTranscript, parseFrequencyDetailOptions, parseFrequencyFilters, queryFrequency } from '@/lib/bank-frequency.mjs';
import { loadFavoriteQuestions } from '@/data/imported-papers.server';
import { parseTermStudyKey } from '@/lib/term-study-data';
import { findFrequencyTerm, loadFrequencyCorpus } from '@/lib/bank-frequency.server';
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
    const entry = url.searchParams.get('entry');
    const identity = entry === null ? null : parseTermStudyKey(entry);
    if (entry !== null && !identity) throw new FrequencyInputError('统计筛选条件无效。');
    const selectedId = identity ? findFrequencyTerm(corpus, identity) : term === null ? undefined : Number(term);
    const result = queryFrequency(corpus, filters, selectedId, parseFrequencyDetailOptions(url.searchParams, corpus));
    if (result.detail) {
      const records = await loadFavoriteQuestions(result.detail.examples.filter(example => example.available).map(example => example.id));
      const questions = new Map(records.map(record => [record.question.id, record.question]));
      result.detail.examples = result.detail.examples.map(example => {
        const question = questions.get(example.id);
        if (!question) return example;
        const passage = example.fields.includes('transcript') ? listeningTranscript([...question.explanation]) : frequencyText(question.passage ?? '');
        const position = passage.indexOf(result.detail!.label);
        const start = Math.max(0, position - 55);
        return { ...example, preview: { prompt: frequencyText(question.prompt).slice(0, 200),
          ...((example.fields.includes('passage') || example.fields.includes('transcript')) && passage ? { passage: `${start ? '…' : ''}${passage.slice(start, start + 240)}${passage.length > start + 240 ? '…' : ''}` } : {}),
          options: question.options.map(option => frequencyText(option.text).slice(0, 180)),
        } };
      });
    }
    return Response.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof FrequencyInputError) return Response.json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return apiErrorResponse(error);
  }
}
