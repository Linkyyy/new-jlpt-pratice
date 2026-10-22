"use client";
import { useId, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { termStudyKey, type TermIdentity } from '@/lib/term-study-data';
import { termFeedbackLabels, type TermFeedbackIssue } from '@/lib/frequency-term-feedback';
import { LoadingSpinner } from '@/components/loading-skeleton';
import {feedbackStatusLabels,type FeedbackStatus} from '@/lib/question-feedback';
import {readFeedbackReceipts,rememberFeedbackReceipt,type FeedbackReceipt} from '@/lib/frequency-feedback-receipts';

export default function TermFeedback({term, revision}: {term: TermIdentity; revision: string}) {
  const {t} = useI18n(), id = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [issue, setIssue] = useState<TermFeedbackIssue>('definition'), [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('');
  const [receipts,setReceipts]=useState<FeedbackReceipt[]>([]),[checking,setChecking]=useState<string|null>(null),[storageWarning,setStorageWarning]=useState(false);
  async function checkStatus(receipt:FeedbackReceipt) {
    if(checking)return;setChecking(receipt.id);setError('');
    try{const response=await fetch('/api/frequency/feedback/status',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:receipt.id,receipt:receipt.receipt}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error??'反馈暂时不可用，请稍后重试。');const updated={...receipt,status:data.status as FeedbackStatus,resolution:data.resolution,updatedAt:data.updatedAt};setReceipts(rows=>rows.map(row=>row.id===receipt.id?updated:row));if(!rememberFeedbackReceipt(updated))setStorageWarning(true);}catch(cause){setError(cause instanceof Error?cause.message:'连接失败，请检查网络后重试。');}finally{setChecking(null);}
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/frequency/feedback', {method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({key: termStudyKey(term), revision, issueType: issue, description: description.trim()}), signal: AbortSignal.timeout(20000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '反馈暂时不可用，请稍后重试。');
      if(typeof result.receipt==='string') {const receipt:FeedbackReceipt={id:result.id,receipt:result.receipt,key:termStudyKey(term),status:'new',updatedAt:Date.now()};if(!rememberFeedbackReceipt(receipt))setStorageWarning(true);setReceipts(rows=>[receipt,...rows].slice(0,5));}
      setSent(true); setDescription('');
    } catch (cause) { setError(cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'TypeError' ? cause.message : '连接失败，请检查网络后重试。'); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => {setReceipts(readFeedbackReceipts().filter(row=>row.key===termStudyKey(term)).slice(0,5));setSent(false); setError(''); dialog.current?.showModal();}} className="inline-flex min-h-9 items-center gap-1 px-1 text-xs font-medium text-slate-500 hover:text-indigo-600"><svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></svg>{t('词条纠错')}</button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onClose={event => event.stopPropagation()} onCancel={event => {event.stopPropagation(); if (busy) event.preventDefault();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-lg font-bold">{t('词条纠错')}</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label={t('关闭词条纠错')} className="settings-toggle">✕</button></div>
      <p className="mt-3 text-sm" lang="ja">{term.label} · {term.reading}</p>
      {!!receipts.length&&<section aria-label={t('我的反馈')} className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-semibold">{t('我的反馈')}</h3>{receipts.map(receipt=><div key={receipt.id} className="border-t border-slate-200 pt-2 text-xs leading-6"><div className="flex items-center justify-between gap-2"><span>{t(feedbackStatusLabels[receipt.status])}</span><button type="button" disabled={Boolean(checking)} onClick={()=>void checkStatus(receipt)} className="min-h-9 text-indigo-600 disabled:opacity-40">{t(checking===receipt.id?'正在查询……':'查看处理进度')}</button></div>{receipt.resolution&&<><p className="whitespace-pre-wrap break-words">{receipt.resolution.note}</p><p className="text-slate-500">{t('核对版本')} {receipt.resolution.revision.slice(0,8)}{receipt.resolution.revision!==revision&&` · ${t('可刷新词条查看最新数据')}`}</p></>}</div>)}<p className="text-xs leading-5 text-slate-500">{t('回执仅保存在当前浏览器，查询时才访问云端。')}</p></section>}
      {storageWarning&&<p role="alert" className="mt-2 text-xs text-amber-800">{t('反馈已提交，但浏览器无法保存回执，请在关闭前查看处理进度。')}</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{t(error)}</p>}
      {sent ? <div className="mt-5 space-y-4"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{t('反馈已提交，感谢帮助完善题库。')}</p><button type="button" onClick={() => dialog.current?.close()} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white">{t('完成')}</button></div> : <form onSubmit={submit} className="mt-4 space-y-4"><fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm font-semibold">{t('问题类型')}<select value={issue} onChange={event => setIssue(event.target.value as TermFeedbackIssue)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{Object.entries(termFeedbackLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label className="block text-sm font-semibold">{t('问题说明')}<textarea required minLength={5} maxLength={2000} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder={t('请描述具体问题，不要填写密码或个人敏感信息。')} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-base font-normal" /></label>
        <p className="text-xs leading-6 text-slate-500">{t('自动附上词条、读音、词性和索引版本，方便核对原题。')}</p>
        <button type="submit" disabled={busy || description.trim().length < 5} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy && <LoadingSpinner />}{t(busy ? '正在提交反馈……' : '提交反馈')}</button>
      </fieldset></form>}
    </dialog>
  </>;
}
