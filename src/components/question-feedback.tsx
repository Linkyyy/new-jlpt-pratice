"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { PracticeQuestion } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";
import { useI18n } from "@/lib/i18n";
import { feedbackIssueLabels, feedbackIssueTypes, type FeedbackIssueType } from "@/lib/question-feedback";
import { LoadingSpinner } from "./loading-skeleton";

const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:outline-2 focus:outline-indigo-500";
export default function QuestionFeedback({ question, paper }: { question: PracticeQuestion; paper: PracticePaper }) {
  const { t } = useI18n(), id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [issueType, setIssueType] = useState<FeedbackIssueType>("answer"), [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [sent, setSent] = useState(false);
  useEffect(() => { const element = dialog.current; return () => element?.close(); }, []);
  function open() { setError(null); setSent(false); dialog.current?.showModal(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (description.trim().length < 5) { setError("请选择问题类型，并填写 5–2000 字的问题说明。"); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/feedback", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: question.id, issueType, description: description.trim() }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) { setError(typeof result.error === "string" ? result.error : "反馈暂时不可用，请稍后重试。"); return; }
      setSent(true); setDescription("");
    } catch { setError("连接失败，请检查网络后重试。"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={open} className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-slate-500 hover:text-indigo-600"><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></svg>{t("反馈题目问题")}</button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { if (busy) event.preventDefault(); }} className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
      <div className="flex items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-lg font-bold">{t("反馈题目问题")}</h2><button type="button" disabled={busy} aria-label={t("关闭题目反馈")} onClick={() => dialog.current?.close()} className="settings-toggle disabled:opacity-40">✕</button></div>
      <p className="mt-3 text-sm text-slate-500">{question.level} · {paper.periodLabel ?? paper.year} · {t(question.category)}{question.sourceQuestionNumber != null ? ` · ${t("原题号")} ${question.sourceQuestionNumber}` : ""}</p>
      {sent ? <div className="mt-5 space-y-5"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">{t("反馈已提交，感谢帮助完善题库。")}</p><button type="button" onClick={() => dialog.current?.close()} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white">{t("完成")}</button></div> : <form onSubmit={submit} className="mt-5 space-y-4"><fieldset disabled={busy} className="space-y-4">
        <div className="block text-sm font-semibold"><label htmlFor={`${id}-type`}>{t("问题类型")}</label><select id={`${id}-type`} value={issueType} onChange={event => setIssueType(event.target.value as FeedbackIssueType)} className={field}>{feedbackIssueTypes.map(type => <option key={type} value={type}>{t(feedbackIssueLabels[type])}</option>)}</select></div>
        <div className="block text-sm font-semibold"><label htmlFor={`${id}-description`}>{t("问题说明")}</label><textarea id={`${id}-description`} autoFocus value={description} onChange={event => setDescription(event.target.value)} required minLength={5} maxLength={2000} rows={5} placeholder={t("请描述具体问题，不要填写密码或个人敏感信息。")} className={`${field} resize-y`} /></div>
        <p className="text-xs leading-6 text-slate-500">{t("将自动附上题目编号，反馈不会修改你的作答记录。")}</p>
        <button type="submit" disabled={busy} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">{busy && <LoadingSpinner />}{t(busy ? "正在提交反馈……" : "提交反馈")}</button>
      </fieldset>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-700">{t(error)}</p>}</form>}
    </dialog>
  </>;
}
