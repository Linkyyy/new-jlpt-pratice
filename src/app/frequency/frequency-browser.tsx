"use client";

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import LoadingSkeleton from '@/components/loading-skeleton';
import FloatingSettings from '@/components/floating-settings';
import { useI18n } from '@/lib/i18n';
import { defaultFrequencyFilters, frequencyLevelScopes, parseFrequencyFilters, type FrequencyDefinition, type FrequencyFilters, type FrequencyMetadata, type FrequencyResult, type FrequencySubtype } from '@/lib/bank-frequency.mjs';

const fieldClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';
const selectClass = `mt-2 ${fieldClass}`;
const buttonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40';
const textActionClass = 'inline-flex min-h-9 items-center gap-1 px-2 text-xs font-semibold text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';
const categories = [['vocabulary', '词汇'], ['grammar', '语法'], ['reading', '阅读'], ['listening', '听力']];
const kindLabels = [['word', '单词'], ['grammar', '语法表达']] as const;
const levelScopeLabels: Record<string, string> = { all: '全部词条（不排除低等级）', N1: 'N1 独有（N2–N5 未出现）', N2: 'N2 及以上独有（N3–N5 未出现）', N3: 'N3 及以上独有（N4–N5 未出现）', N4: 'N4 及以上独有（N5 未出现）' };

function periodLabel(period: string, t: (value: string) => string) {
  return /^\d{6}$/.test(period) ? t(`${period.slice(0, 4)}年${Number(period.slice(4))}月`) : t(`${period} 原创版`);
}
function subtypeLabel(subtype: FrequencySubtype, t: (value: string, params?: Record<string, string | number>) => string) {
  return [t(subtype.label), subtype.level, subtype.problem && t('问题 {0}', { 0: subtype.problem })].filter(Boolean).join(' · ');
}
function DefinitionText({definition, full = false}: {definition: FrequencyDefinition; full?: boolean}) {
  const {t} = useI18n();
  return <div className="mt-2 space-y-1 text-xs leading-6 text-slate-600" lang="zh-CN"><p className={full ? 'whitespace-pre-line' : 'line-clamp-3'}>{definition.meaning || t('释义待补充')}</p>{definition.usage && <p className={full ? '' : 'line-clamp-4'}><span className="font-semibold">{t('用法')}：</span>{definition.usage}</p>}{full && (definition.source === 'wiktionary' && definition.word ? <a href={`https://zh.wiktionary.org/wiki/${encodeURIComponent(definition.word)}#日語`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center text-indigo-600 underline">{t('中文维基词典 · CC BY-SA 4.0')}</a> : definition.source === 'editorial' ? <p className="text-slate-400">{t('站内学习释义；具体含义请结合原题。')}</p> : <p className="text-slate-400">{t('未收录可靠释义，暂不自动推测。')}</p>)}</div>;
}
function queryString(filters: FrequencyFilters) {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaultFrequencyFilters) as (keyof FrequencyFilters)[]) {
    if (filters[key] !== defaultFrequencyFilters[key]) params.set(key, String(filters[key]));
  }
  return params.toString();
}
function useFrequencyRequest(query: string, requestKey: string) {
  const [state, setState] = useState<{ key: string; data?: FrequencyResult; error?: string }>({ key: '' });
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/frequency?${query}`, { signal: abort.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '词频统计暂时无法加载，请重试。');
      return body as FrequencyResult;
    }).then(data => { if (!abort.signal.aborted) setState({ key: requestKey, data }); })
      .catch(error => { if (!abort.signal.aborted) setState({ key: requestKey, error: error instanceof Error ? error.message : '词频统计暂时无法加载，请重试。' }); });
    return () => abort.abort();
  }, [query, requestKey]);
  return state.key === requestKey ? { data: state.data, error: state.error, loading: false } : { data: undefined, error: undefined, loading: true };
}

function FrequencyDetail({ query, id, metadata, onClose }: { query: string; id: number; metadata: FrequencyMetadata; onClose: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [retry, setRetry] = useState(0);
  const [examplePage, setExamplePage] = useState(1);
  const [examplePaper, setExamplePaper] = useState('all');
  const params = new URLSearchParams(query);
  params.set('term', String(id)); params.set('examplePage', String(examplePage));
  if (examplePaper !== 'all') params.set('examplePaper', examplePaper);
  const url = params.toString();
  const { data, error, loading } = useFrequencyRequest(url, `${url}:${retry}`);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onClose={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.currentTarget.close();
  }} aria-labelledby="frequency-detail-title" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
    <div className="flex items-start justify-between gap-3"><h2 id="frequency-detail-title" className="text-xl font-bold">{data?.detail?.label ?? t('词条出处')}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={t('关闭')} className={`${buttonClass} shrink-0 px-3`}>✕</button></div>
    {loading ? <div className="mt-5"><LoadingSkeleton label="正在加载词频统计……" /></div> : error ? <div role="alert" className="mt-5"><p>{t(error)}</p><button className={`${buttonClass} mt-3`} onClick={() => setRetry(value => value + 1)}>{t('重试')}</button></div> : data?.detail ? <>
      <div className="mt-4 rounded-xl bg-slate-50 p-3"><DefinitionText definition={data.detail.definition} full /></div>
      <p className="mt-3 text-sm leading-6 text-slate-500">{t('出现 {0} 次 · 覆盖 {1} 题 · {2} 个场次', { 0: data.detail.occurrences, 1: data.detail.questions, 2: data.detail.papers })}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{t('显示当前筛选范围内的全部出处，可按试卷筛选或翻页。')}</p>
      <label className="mt-4 block text-xs font-semibold text-slate-600">{t('出处试卷')}<select aria-label={t('出处试卷')} value={examplePaper} onChange={event => { setExamplePaper(event.target.value); setExamplePage(1); dialog.current?.scrollTo(0, 0); }} className={selectClass}><option value="all">{t('全部试卷')}</option>{data.detail.sourcePapers.map(paper => <option key={paper.id} value={paper.id}>{paper.level} · {periodLabel(paper.period, t)} · {t(paper.source === 'imported' ? '用户提供题库' : '原创模拟题库')} · {paper.questions} {t('题')}</option>)}</select></label>
      <ul className="mt-4 space-y-2">{data.detail.examples.map(example => {
        const subtype = metadata.subtypes.find(item => item.id === example.subtype);
        const label = `${example.level} · ${periodLabel(example.period, t)} · ${t(categories.find(([key]) => key === example.category)?.[1] ?? example.category)}`;
        const href = `/practice?${new URLSearchParams({ source: example.source, level: example.level, year: example.period, type: example.category, mode: 'practice', question: example.id })}`;
        return <li key={example.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-semibold">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{subtype && subtypeLabel(subtype, t)}{example.number !== null && ` · ${t(example.source === 'original' ? '题目 {0}' : '原题号 {0}', { 0: example.number })}`}</p><p className="mt-2 text-xs text-indigo-600">{t('出现位置')}：{example.fields.map(field => t(({ passage: '文章', prompt: '题干', options: '选项', transcript: '听力原文' } as Record<string, string>)[field] ?? field)).join(' · ')}</p>{example.preview && <details className="mt-2 text-sm"><summary className="cursor-pointer text-slate-600">{t('预览题目')}</summary><div className="mt-2 space-y-2 rounded-lg bg-white p-3 text-xs leading-6" lang="ja"><p className="whitespace-pre-line">{example.preview.prompt}</p>{example.preview.passage && <p className="whitespace-pre-line text-slate-500">{example.preview.passage}</p>}<ol className="list-inside list-decimal space-y-1">{example.preview.options.map((option, index) => <li key={index}>{option}</li>)}</ol></div></details>}{example.available ? <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-indigo-600 hover:underline">{t('查看题目')} →</Link> : <p className="mt-2 text-xs text-slate-500">{t('该题资源暂不完整，仅参与文本统计。')}</p>}</li>;
      })}</ul>
      <nav aria-label={t('出处分页')} className="mt-4 flex items-center justify-between gap-2"><button type="button" disabled={data.detail.examplePage <= 1} onClick={() => { setExamplePage(data.detail!.examplePage - 1); dialog.current?.scrollTo(0, 0); }} className={buttonClass}>{t('上一页')}</button><span className="text-xs tabular-nums text-slate-500">{t('第 {0} / {1} 页', { 0: data.detail.examplePage, 1: Math.max(1, Math.ceil(data.detail.exampleTotal / data.detail.exampleSize)) })} · {data.detail.exampleTotal} {t('题')}</span><button type="button" disabled={data.detail.examplePage >= Math.ceil(data.detail.exampleTotal / data.detail.exampleSize)} onClick={() => { setExamplePage(data.detail!.examplePage + 1); dialog.current?.scrollTo(0, 0); }} className={buttonClass}>{t('下一页')}</button></nav>
      <p className="mt-4 text-xs leading-6 text-slate-500">{t('词条可能出现在文章、题干或选项中，不表示它就是该题考点。')}</p>
    </> : <p className="mt-5 text-sm text-slate-500">{t('当前筛选下没有这个词条。')}</p>}
  </dialog>;
}

export default function FrequencyBrowser({ metadata }: { metadata: FrequencyMetadata }) {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const input = searchParams.toString();
  const parsed = useMemo(() => {
    try { return { filters: parseFrequencyFilters(new URLSearchParams(input), metadata), error: '' }; }
    catch (error) { return { filters: defaultFrequencyFilters, error: error instanceof Error ? error.message : '统计筛选条件无效。' }; }
  }, [input, metadata]);
  const { filters } = parsed;
  const query = queryString(filters);
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState(false);
  const [selected, setSelected] = useState<{ query: string; id: number } | null>(null);
  const { data, error, loading } = useFrequencyRequest(query, `${query}:${retry}`);
  const update = (patch: Partial<FrequencyFilters>, push = false) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    if (next.exclusive !== 'all') {
      const limit = Number(next.exclusive.slice(1));
      if (next.level !== 'all' && Number(next.level.slice(1)) > limit) next.level = 'all';
      const subtype = metadata.subtypes.find(item => item.id === next.subtype);
      if (subtype?.levels && !subtype.levels.some(level => Number(level.slice(1)) <= limit)) next.subtype = 'all';
    }
    const params = queryString(next);
    window.history[push ? 'pushState' : 'replaceState'](null, '', `/frequency${params ? `?${params}` : ''}`);
  };
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim() }, true);
  }
  async function exportResults(format: 'xlsx' | 'pdf') {
    if (exporting) return;
    setExporting(format); setExportMessage(''); setExportError(false);
    try {
      const params = new URLSearchParams(query); params.set('format', format); params.set('locale', locale);
      const response = await fetch(`/api/frequency/export?${params}`, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? '导出失败，请重试。'); }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = href; link.download = `jlpt-frequency-${filters.kind}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      setExportMessage('导出成功，文件已开始下载。');
    } catch (error) { setExportError(true); setExportMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : '导出失败，请重试。'); }
    finally { setExporting(null); }
  }
  const reset = () => window.history.pushState(null, '', '/frequency');
  const page = data?.filters.page ?? filters.page;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.size));
  const levels = metadata.levels.filter(level => filters.exclusive === 'all' || Number(level.slice(1)) <= Number(filters.exclusive.slice(1)));
  const selectedLevels = filters.level === 'all' ? levels : [filters.level];
  const subtypes = metadata.subtypes.filter(item => (filters.category === 'all' || item.category === filters.category) && (!item.levels || item.levels.some(level => selectedLevels.includes(level))));
  const stats = [['纳入题目', data?.questionCount], ['覆盖场次', data?.paperCount], ['匹配词条', data?.total], ['出现总次数', data?.totalOccurrences]] as const;
  const mainError = parsed.error || error;
  const activeFilters = (['source', 'level', 'exclusive', 'period', 'category', 'subtype', 'field', 'pos', 'order', 'min'] as const).filter(key => filters[key] !== defaultFrequencyFilters[key]).length;
  return <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-8 sm:py-8"><div className="mx-auto max-w-6xl space-y-5">
    <header><Link href="/" className="inline-flex min-h-10 items-center text-sm font-semibold text-indigo-600">{t('← 首页')}</Link><div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('题库词频统计')}</h1><p className="pb-0.5 text-xs text-slate-500">{t('从题库正文看高频词与表达')}</p></div></header>
    <section aria-label={t('统计筛选')} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <div role="group" aria-label={t('统计内容')} className="grid grid-cols-2 gap-1 rounded-xl bg-slate-50 p-1">{kindLabels.map(([kind, label]) => <button type="button" key={kind} aria-pressed={filters.kind === kind} onClick={() => update({ kind })} className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${filters.kind === kind ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>{t(label)}</button>)}</div>
      <form onSubmit={search} role="search" className="mt-4 flex items-center gap-2"><label className="block min-w-0 flex-1"><span className="sr-only">{t('搜索词条或读音')}</span><input key={filters.q} type="search" name="q" defaultValue={filters.q} maxLength={80} placeholder={t('搜索词条或读音')} className={`${fieldClass} h-11`} /></label><button type="submit" className={`${buttonClass} h-11 shrink-0 border-indigo-200 text-indigo-600`}>{t('搜索')}</button></form>
      <div className="mt-3 flex items-center justify-between gap-3 lg:hidden"><button type="button" aria-expanded={filtersOpen} aria-controls="frequency-filter-controls" onClick={() => setFiltersOpen(value => !value)} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-indigo-600"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path d="M4 7h7m5 0h4M4 17h2m5 0h9"/><circle cx="13.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/></svg>{t('筛选与排序')}{activeFilters > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs tabular-nums">{activeFilters}</span>}<span aria-hidden="true" className="text-xs">{filtersOpen ? '▴' : '▾'}</span></button><button type="button" onClick={reset} className="min-h-10 px-2 text-xs font-semibold text-slate-500">{t('重置筛选')}</button></div>
      <div id="frequency-filter-controls" className={`${filtersOpen ? '' : 'hidden'} mt-3 grid-cols-2 gap-x-3 gap-y-4 ${filtersOpen ? 'grid' : ''} lg:mt-4 lg:grid lg:grid-cols-4`}>
        <label className="text-xs font-semibold text-slate-600">{t('题库来源')}<select aria-label={t('题库来源')} value={filters.source} onChange={event => update({ source: event.target.value })} className={selectClass}><option value="all">{t('全部题库')}</option><option value="imported">{t('用户提供题库')}</option><option value="original">{t('原创模拟题库')}</option></select></label>
        <label className="text-xs font-semibold text-slate-600">{t('日语等级')}<select aria-label={t('日语等级')} value={filters.level} onChange={event => update({ level: event.target.value, subtype: 'all' })} className={selectClass}><option value="all">{t(filters.exclusive === 'all' ? '全部等级' : '范围内全部等级')}</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
        <label className="col-span-2 text-xs font-semibold text-slate-600">{t('等级独有范围')}<select aria-label={t('等级独有范围')} aria-describedby={filters.exclusive === 'all' ? undefined : 'frequency-exclusive-note'} value={filters.exclusive} onChange={event => update({ exclusive: event.target.value })} className={selectClass}>{frequencyLevelScopes.map(scope => <option key={scope} value={scope}>{t(levelScopeLabels[scope])}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">{t('题目类型')}<select aria-label={t('题目类型')} value={filters.category} onChange={event => update({ category: event.target.value, subtype: 'all' })} className={selectClass}><option value="all">{t('全部题型')}</option>{categories.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">{t('子题型')}<select aria-label={t('子题型')} value={filters.subtype} onChange={event => update({ subtype: event.target.value })} className={selectClass}><option value="all">{t('全部子题型')}</option>{categories.filter(([category]) => subtypes.some(item => item.category === category)).map(([category, label]) => <optgroup key={category} label={t(label)}>{subtypes.filter(item => item.category === category).map(item => <option key={item.id} value={item.id}>{subtypeLabel(item, t)}</option>)}</optgroup>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">{t('场次／版本')}<select aria-label={t('场次／版本')} value={filters.period} onChange={event => update({ period: event.target.value })} className={selectClass}><option value="all">{t('全部场次')}</option>{metadata.periods.map(period => <option key={period} value={period}>{periodLabel(period, t)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">{t('文本范围')}<select aria-label={t('文本范围')} value={filters.field} onChange={event => update({ field: event.target.value })} className={selectClass}>{[['all', '全部题文'], ['passage', '文章'], ['prompt', '题干'], ['options', '选项'], ['transcript', '听力原文']].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600">{t('排序方式')}<select aria-label={t('排序方式')} value={filters.order} onChange={event => update({ order: event.target.value })} className={selectClass}>{[['occurrences', '出现次数（多到少）'], ['occurrences-asc', '出现次数（少到多）'], ['questions', '覆盖题目优先'], ['papers', '覆盖场次优先'], ['alphabetical', '五十音顺序']].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <div className="flex items-end"><button onClick={reset} type="button" className={`${buttonClass} w-full px-2 text-xs text-slate-500`}>{t('重置筛选')}</button></div>
      </div>
      {filters.exclusive !== 'all' && <div id="frequency-exclusive-note" className="mt-4 rounded-xl bg-indigo-50 p-3 text-xs leading-6 text-indigo-700"><p className="font-semibold">{t(levelScopeLabels[filters.exclusive])}</p><p>{t('低等级对照使用全部题库、场次、题型和文本；这是题库差集，不是官方词汇分级。')}</p></div>}
      <details className={`${filtersOpen ? '' : 'hidden'} mt-4 border-t border-slate-100 pt-3 lg:block`}><summary className="cursor-pointer text-xs font-semibold text-slate-500">{t('更多筛选')}</summary><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-600">{t('词性')}<select aria-label={t('词性')} value={filters.pos} disabled={filters.kind !== 'word'} onChange={event => update({ pos: event.target.value })} className={`${selectClass} disabled:opacity-40`}><option value="all">{t('全部词性')}</option>{['名词', '动词', '形容词', '副词', '连体词', '接续词'].map(pos => <option key={pos} value={pos}>{t(pos)}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">{t('最少出现次数')}<input aria-label={t('最少出现次数')} type="number" min={1} max={100000} defaultValue={filters.min} key={filters.min} onBlur={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1 && value <= 100000) update({ min: value }); else event.target.value = String(filters.min); }} className={selectClass} /></label><label className="text-xs font-semibold text-slate-600">{t('每页条数')}<select aria-label={t('每页条数')} value={filters.size} onChange={event => update({ size: Number(event.target.value) })} className={selectClass}>{[30, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div></details>
    </section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite" aria-busy={loading}>{stats.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">{t(label)}</p><p className="mt-1 text-xl font-bold tabular-nums">{loading || value === undefined ? '—' : value.toLocaleString()}</p></div>)}</div>
    <section aria-labelledby="frequency-ranking-title" aria-busy={loading} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="frequency-ranking-title" className="font-bold">{t(kindLabels.find(([kind]) => kind === filters.kind)![1])} · {t('出现频率排名')}</h2><div className="flex flex-wrap items-center gap-2"><button type="button" aria-label={t('切换出现次数排序')} onClick={() => update({ order: filters.order === 'occurrences' ? 'occurrences-asc' : 'occurrences' })} className={textActionClass}>{t('出现次数')}{filters.order === 'occurrences-asc' ? ' ↑' : filters.order === 'occurrences' ? ' ↓' : ' ↕'}</button><FloatingSettings title={t('导出')} triggerClassName={textActionClass} trigger={<>{exporting ? t('正在导出……') : t('导出')} <span aria-hidden="true">⌄</span></>}><div className="mt-4 space-y-2">{(['xlsx', 'pdf'] as const).map(format => <button type="button" key={format} disabled={loading || Boolean(parsed.error) || Boolean(exporting) || !data} onClick={event => { event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover(); void exportResults(format); }} aria-label={t(format === 'xlsx' ? '导出 Excel' : '导出 PDF')} className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40"><span><span className="block text-sm font-semibold text-slate-900">{format === 'xlsx' ? 'Excel' : 'PDF'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t(format === 'xlsx' ? '表格，便于筛选整理' : '文档，便于打印复习')}</span></span><span aria-hidden="true" className="text-indigo-600">↓</span></button>)}</div></FloatingSettings></div></div><p className="mt-2 text-xs leading-5 text-slate-500">{t('同篇文章与共用听力原文去重，点击词条查看出处。')}</p><p className="mt-1 text-xs text-slate-500">{t('导出包含当前筛选的全部排名结果，不限当前页。')}</p>{exportMessage && <p role={exportError ? 'alert' : 'status'} className={`mt-2 text-xs ${exportError ? 'text-rose-700' : 'text-indigo-600'}`}>{t(exportMessage)}</p>}</div>
      {mainError ? <div role="alert" className="p-6"><p className="text-sm text-rose-700">{t(mainError)}</p><div className="mt-3 flex gap-2"><button onClick={() => setRetry(value => value + 1)} className={buttonClass}>{t('重试')}</button><button onClick={reset} className={buttonClass}>{t('重置筛选')}</button></div></div> : loading ? <div className="p-5"><LoadingSkeleton label="正在加载词频统计……" /></div> : data?.rows.length ? <>
        <ul className="divide-y divide-slate-100 sm:hidden">{data.rows.map(row => <li key={row.id} className="flex items-start gap-3 px-4 py-4"><span className={`w-6 shrink-0 pt-0.5 text-sm font-semibold tabular-nums ${row.rank <= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>{row.rank}</span><div className="min-w-0 flex-1"><button onClick={() => setSelected({ query, id: row.id })} className="max-w-full break-words text-left font-semibold text-slate-900 hover:text-indigo-600" lang="ja">{row.label}</button><p className="mt-1 break-words text-xs text-slate-500"><span lang="ja">{row.reading}</span>{row.reading && ' · '}{t(row.pos)}</p><DefinitionText definition={row.definition} /><p className="mt-2 text-xs text-slate-500">{t('覆盖 {0} 题 · {1} 个场次', { 0: row.questions, 1: row.papers })}</p></div><div className="shrink-0 text-right"><p className="font-bold tabular-nums text-indigo-600">{row.occurrences.toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">{t('次')}</p></div></li>)}</ul>
        <table className="hidden w-full text-left text-sm sm:table"><caption className="sr-only">{t('出现频率排名')}</caption><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['排名', '词条', '中文释义／用法', '出现次数', '覆盖题目', '覆盖场次'].map(label => <th key={label} className="px-5 py-3 font-semibold first:w-20">{t(label)}</th>)}</tr></thead><tbody>{data.rows.map(row => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50"><td className={`px-5 py-4 font-semibold tabular-nums ${row.rank <= 3 ? 'text-indigo-600' : 'text-slate-400'}`}>{row.rank}</td><td className="px-5 py-3"><button onClick={() => setSelected({ query, id: row.id })} className="text-left font-semibold text-slate-900 hover:text-indigo-600 hover:underline" lang="ja">{row.label}</button><p className="mt-1 text-xs text-slate-500"><span lang="ja">{row.reading}</span>{row.reading && ' · '}{t(row.pos)}</p></td><td className="min-w-40 max-w-xs px-4 py-3 align-top"><DefinitionText definition={row.definition} /></td><td className="px-5 py-3 font-bold tabular-nums text-indigo-600">{row.occurrences.toLocaleString()}</td><td className="px-5 py-3 tabular-nums text-slate-600">{row.questions.toLocaleString()}</td><td className="px-5 py-3 tabular-nums text-slate-600">{row.papers.toLocaleString()}</td></tr>)}</tbody></table>
      </> : <div className="px-5 py-12 text-center"><p className="font-semibold">{t('没有符合条件的词条')}</p><p className="mt-2 text-sm text-slate-500">{t('试试减少筛选条件，或更换文本范围。')}</p></div>}
      {!mainError && !loading && Boolean(data?.total) && <nav aria-label={t('词频列表分页')} className="flex items-center justify-between gap-2 border-t border-slate-100 p-4"><button disabled={page <= 1} onClick={() => update({ page: page - 1 }, true)} className={buttonClass}>{t('上一页')}</button><span className="text-xs tabular-nums text-slate-500">{t('第 {0} / {1} 页', { 0: page, 1: pages })}</span><button disabled={page >= pages} onClick={() => update({ page: page + 1 }, true)} className={buttonClass}>{t('下一页')}</button></nav>}
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500 sm:p-6"><summary className="cursor-pointer font-semibold text-slate-700">{t('统计口径与范围')}</summary><div className="mt-3 space-y-2"><p>{t('统计当前题库中的 {0} 道题，包括资源暂不完整但有文字的题目。', { 0: metadata.summary.questions })}</p><p>{t('题文包含文章、题干、所有选项和可识别的日文听力原文；不含题型说明、中文解析、图片内文字，也不识别 MP3。')}</p><p>{t('同场次、同等级、同题型的共享文章或同一原文只统计一次；覆盖题目数包含该文章对应的小题。场次按题库来源、等级和年月区分。')}</p><p>{t('单词使用日语分词，合并动词等活用形式，排除助词、助动词、数字及常见停用词。')}</p><p>{t('语法表达按常见固定表达与活用变体匹配，同类重叠取最长；接续表达结合规则与词性识别，可能存在歧义或漏计。文本出现频率不等于真实考查频率。')}</p><p>{t('听力中 {0}/{1} 道题可提取日文原文；其余仅统计已有题干与选项。', { 0: metadata.summary.transcripts, 1: metadata.summary.listeningQuestions })}</p><p>{t('选项中可能包含干扰项；语法排序题不拼接选项推断完整句子。')}</p></div></details>
    <p className="px-1 text-xs leading-6 text-slate-500">{t('中文词典来源：中文维基词典贡献者，经 Wiktextract／Kaikki.org、Nichū 整理，CC BY-SA 4.0。语法用法为站内学习说明。未覆盖的词条标注“释义待补充”。')} <a href="https://github.com/Linkyyy/new-jlpt-pratice/tree/main/src/data/frequency-dictionary" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{t('数据来源与许可')}</a></p><footer className="pb-3 text-center text-xs text-slate-500"><Link href="/" className="inline-flex min-h-9 items-center hover:text-indigo-600">JLPT Practice · {t('返回刷题网站')}</Link></footer>
  </div>{selected?.query === query && <FrequencyDetail key={`${query}:${selected.id}`} query={query} id={selected.id} metadata={metadata} onClose={() => setSelected(null)} />}</main>;
}
