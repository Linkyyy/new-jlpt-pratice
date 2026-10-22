import { parseFrequencyPdfOptions } from '@/lib/frequency-pdf-options.mjs';
import metadata from '@/data/bank-frequency/manifest.json';
import { FrequencyInputError, parseFrequencyFilters, queryFrequency } from '@/lib/bank-frequency.mjs';
import { loadFrequencyCorpus } from '@/lib/bank-frequency.server';
import { createFrequencyPdf, createFrequencyWorkbook, frequencyExportLimit } from '@/lib/frequency-export.mjs';
import { apiErrorResponse, checkApiRateLimit, HttpRequestError, readLimitedJson } from '@/lib/request-limits';
import { checkFrequencyAccess } from '@/lib/frequency-access.server';
import {createAnkiText,createWordListText} from '@/lib/term-card-export';
import {isTermStudyData} from '@/lib/term-study-data';
import {createTermStudyPdf} from '@/lib/term-study-pdf.mjs';
import {checkApiOrigin} from '@/lib/request-security';

export const maxDuration = 60;
let active = 0;
function admitExport(request: Request) {
  const crossSite=checkApiOrigin(request);if(crossSite)return crossSite;
  const access = checkFrequencyAccess(request);
  if (access) return access;
  if (process.env.FREQUENCY_EXPORT_ENABLED === 'false') return apiErrorResponse(new HttpRequestError(503, '导出暂时关闭，请稍后重试。', 300));
  const denied = checkApiRateLimit(request, { scope: 'frequency-export', limit: 6, windowSeconds: 60 });
  if (denied) return denied;
  const hourly = checkApiRateLimit(request, { scope: 'frequency-export-hour', limit: 20, windowSeconds: 3600 });
  if (hourly) return hourly;
  if (active >= 1) return apiErrorResponse(new HttpRequestError(429, '导出正在处理中，请稍后重试。', 5));
  return null;
}
export async function GET(request: Request) {
  const denied=admitExport(request);if(denied)return denied;
  active++;
  try {
    const url = new URL(request.url), format = url.searchParams.get('format'), locale = url.searchParams.get('locale') ?? 'zh';
    if (url.search.length > 2000 || !['xlsx', 'pdf', 'anki', 'words'].includes(format ?? '') || !['zh', 'ja', 'en'].includes(locale)) throw new FrequencyInputError('导出参数无效。');
    const pdfOptions = format === 'pdf' ? parseFrequencyPdfOptions(url.searchParams) : undefined;
    const filters = parseFrequencyFilters(url.searchParams, metadata);
    const corpus = await loadFrequencyCorpus();
    const result = queryFrequency(corpus, { ...filters, page: 1 }, undefined, { allRows: true });
    if (result.total > frequencyExportLimit) throw new HttpRequestError(413, '结果过多，请增加筛选条件后导出。');
    if(format==='anki'||format==='words') {
      const cards=result.rows.map(row=>({kind:filters.kind==='connective'?'word' as const:filters.kind,label:row.label,reading:row.reading,pos:row.pos,meaning:row.definition.meaning,usage:row.definition.usage,referenceLevels:row.referenceLevels}));
      const text=format==='anki'?createAnkiText(cards,url.origin):createWordListText(cards);
      return new Response(text,{headers:{'Content-Type':format==='anki'?'text/tab-separated-values; charset=utf-8':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="jlpt-frequency-${filters.kind}.${format==='anki'?'tsv':'txt'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const language = locale as 'zh' | 'ja' | 'en';
    const bytes = format === 'pdf' ? await createFrequencyPdf(result, metadata, language, new Date(), undefined, pdfOptions) : await createFrequencyWorkbook(result, metadata, language);
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="jlpt-frequency-${filters.kind}-${new Date().toISOString().slice(0, 10)}.${format}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof FrequencyInputError) return Response.json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    return apiErrorResponse(error);
  } finally { active--; }
}

export async function POST(request: Request) {
  const denied=admitExport(request);if(denied)return denied;
  active++;
  try {
    const url=new URL(request.url),locale=url.searchParams.get('locale')??'zh';
    if(url.search.length>2000||url.searchParams.get('format')!=='pdf'||!['zh','ja','en'].includes(locale))throw new HttpRequestError(400,'导出参数无效。');
    const data=await readLimitedJson(request,1024*1024);
    if(!isTermStudyData(data)||!data.entries.length)throw new HttpRequestError(400,'收藏词条格式无效，请刷新后重试。');
    const bytes=await createTermStudyPdf(data.entries,url.origin,locale as 'zh'|'ja'|'en');
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="jlpt-saved-terms.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  } catch(error) {return apiErrorResponse(error);} finally {active--;}
}
