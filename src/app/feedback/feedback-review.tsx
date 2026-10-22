"use client";

import { termFeedbackLabels } from "@/lib/frequency-term-feedback";
import type {TermFeedbackResolution} from '@/lib/frequency-term-feedback';
import QualityReview from './quality-review';
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CloudBackup from "@/components/cloud-backup";
import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";
import { feedbackIssueLabels, feedbackStatuses, feedbackStatusLabels, type FeedbackList, type FeedbackStatus, type QuestionFeedbackRecord } from "@/lib/question-feedback";

class FeedbackError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function requestFeedback(path = "", body?: { id: string; status: FeedbackStatus; note?:string }, signal?: AbortSignal): Promise<FeedbackList & {resolution?:TermFeedbackResolution|null}> {
  const response = await fetch(`/api/feedback${path}`, { credentials: "same-origin", cache: "no-store", signal: signal ?? AbortSignal.timeout(20000), ...(body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new FeedbackError(response.status, typeof value.error === "string" ? value.error : "反馈暂时不可用，请稍后重试。");
  return value;
}
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40";
function questionUrl(item: QuestionFeedbackRecord) {
  if (item.termFeedback) return `/frequency?${new URLSearchParams({kind: item.termFeedback.term.kind, q: item.termFeedback.term.label})}`;
  const category = { 词汇: "vocabulary", 语法: "grammar", 阅读: "reading", 听力: "listening" }[item.category] ?? "all";
  return `/practice?${new URLSearchParams({ source: item.source, level: item.level, year: item.period, type: category, mode: "practice", question: item.questionId })}`;
}
export default function FeedbackReview() {
  const { t, locale } = useI18n();
  const generation = useRef(0), activeRequest = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"all" | FeedbackStatus>("new"), [reload, setReload] = useState(0);
  const [notes,setNotes]=useState<Record<string,string>>({}),[qualityOpen,setQualityOpen]=useState(false);
  const [result, setResult] = useState<FeedbackList | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null), [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    let active = true;
    const current = generation.current;
    activeRequest.current = controller;
    requestFeedback(`?status=${status}`, undefined, controller.signal).then(value => { if (active && !controller.signal.aborted && generation.current === current) { setResult(value); setError(null); } }, cause => { if (active && generation.current === current) { if (cause instanceof FeedbackError && (cause.status === 401 || cause.status === 403)) setResult(null); setError(cause instanceof FeedbackError ? cause.message : "连接失败，请检查网络后重试。"); } }).finally(() => { clearTimeout(timer); if (active && generation.current === current) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); if (activeRequest.current === controller) activeRequest.current = null; };
  }, [status, reload]);
  function refresh(next = status) { generation.current += 1; activeRequest.current?.abort(); setBusy(null); setStatus(next); setResult(null); setError(null); setLoading(true); setNotice(""); setReload(value => value + 1); }
  async function more() {
    if (!result?.nextCursor || busy) return;
    const current = generation.current;
    setBusy("more"); setError(null);
    try { const next = await requestFeedback(`?${new URLSearchParams({ status, cursor: result.nextCursor })}`); if (generation.current !== current) return; setResult(previous => previous ? { items: [...previous.items, ...next.items], nextCursor: next.nextCursor } : next); }
    catch (cause) { if (generation.current === current) { if (cause instanceof FeedbackError && (cause.status === 401 || cause.status === 403)) setResult(null); setError(cause instanceof FeedbackError ? cause.message : "连接失败，请检查网络后重试。"); } }
    finally { if (generation.current === current) setBusy(null); }
  }
  async function update(item: QuestionFeedbackRecord, next: FeedbackStatus) {
    if (busy) return;
    const current = generation.current;
    setBusy(item.id); setError(null); setNotice("");
    try {
      const updated=await requestFeedback("", { id: item.id, status: next,...(item.termFeedback?{note:notes[item.id]??item.termFeedback.resolution?.note??''}:{}) });
      if (generation.current !== current) return;
      setResult(previous => previous ? { ...previous, items: previous.items.map(entry => entry.id === item.id ? { ...entry, status: next,...(entry.termFeedback?{termFeedback:{...entry.termFeedback,resolution:updated.resolution??undefined}}:{}) } : entry).filter(entry => status === "all" || entry.status === status) } : previous);
      setNotice("反馈状态已更新。");
    } catch (cause) { if (generation.current === current) { if (cause instanceof FeedbackError && (cause.status === 401 || cause.status === 403)) setResult(null); setError(cause instanceof FeedbackError ? cause.message : "连接失败，请检查网络后重试。"); } }
    finally { if (generation.current === current) setBusy(null); }
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:p-8"><div className="mx-auto max-w-4xl space-y-5"><header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/" className="text-sm font-semibold text-indigo-600">{t("← 首页")}</Link><h1 className="mt-3 text-2xl font-bold">{t("题目与词条反馈")}</h1></div><div className="flex items-center gap-2"><CloudBackup disabled={false} onAccountChange={() => refresh()} /><button type="button" onClick={() => refresh()} disabled={loading || Boolean(busy)} className={button}>{t("刷新")}</button></div></header>
    <p className="text-sm leading-6 text-slate-500">{t("仅站点管理员可以查看和处理反馈，请先登录管理员云备份账号，再刷新列表。")}</p>
    <details onToggle={event=>setQualityOpen(event.currentTarget.open)} className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-indigo-600">{t('词条质量复核')}</summary>{qualityOpen&&<div className="mt-4"><QualityReview key={reload}/></div>}</details>
    <nav aria-label={t("反馈状态筛选")} className="flex flex-wrap gap-2">{(["all", ...feedbackStatuses] as const).map(value => <button key={value} type="button" aria-pressed={status === value} disabled={Boolean(busy)} onClick={() => refresh(value)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${status === value ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{t(value === "all" ? "全部" : feedbackStatusLabels[value])}</button>)}</nav>
    {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-700">{t(error)}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{t(notice)}</p>}
    {loading ? <LoadingSkeleton label="正在读取题目反馈……" /> : result && <>{!result.items.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{t("暂无此状态的题目反馈。")}</p> : <div className="space-y-4">{result.items.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold">{item.termFeedback ? <><span lang="ja">{item.termFeedback.term.label}</span><span className="ml-2 font-normal text-slate-500">{item.termFeedback.term.reading} · {t(item.termFeedback.term.pos)}</span></> : <>{item.level} · {item.period} · {t(item.category)}{item.questionNumber != null ? ` · ${t("原题号")} ${item.questionNumber}` : ""}</>}</h2><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{t(item.termFeedback ? termFeedbackLabels[item.termFeedback.issue] : feedbackIssueLabels[item.issueType])}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{item.description}</p>{item.termFeedback&&<div className="mt-3 space-y-2"><label className="block text-xs font-semibold text-slate-600">{t('处理说明')}<textarea aria-label={t('处理说明')} rows={3} maxLength={1000} value={notes[item.id]??item.termFeedback.resolution?.note??''} onChange={event=>setNotes(values=>({...values,[item.id]:event.target.value}))} placeholder={t('说明已修正内容、保留原因或待补充依据。')} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal"/></label><p className="text-xs text-slate-500">{t('标记已处理前需填写至少 5 字说明；保存时记录当前词库版本。')}</p>{item.termFeedback.resolution&&<p className="text-xs text-slate-500">{t('核对版本')} {item.termFeedback.resolution.revision.slice(0,8)}</p>}</div>}<p className="mt-3 break-all text-xs leading-6 text-slate-500">{item.questionId} · {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(item.createdAt)} (JST)</p><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Link href={questionUrl(item)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600">{t(item.termFeedback ? "查看词条 ↗" : "查看原题 ↗")}</Link><label className="flex items-center gap-2 text-sm">{t("处理状态")}<select aria-label={t("处理状态")} value={item.status} disabled={Boolean(busy)} onChange={event => void update(item, event.target.value as FeedbackStatus)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm">{feedbackStatuses.map(value => <option key={value} value={value} disabled={value==="resolved"&&Boolean(item.termFeedback)&&(notes[item.id]??item.termFeedback?.resolution?.note??"").trim().length<5}>{t(feedbackStatusLabels[value])}</option>)}</select></label></div></article>)}</div>}{result.nextCursor && <button type="button" disabled={Boolean(busy)} onClick={() => void more()} className={`${button} w-full`}>{t(busy === "more" ? "正在加载……" : "加载更多")}</button>}</>}
  </div></main>;
}
