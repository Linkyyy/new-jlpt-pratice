"use client";

import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { defaultFrequencyPdfOptions, frequencyPdfFields, type FrequencyPdfField, type FrequencyPdfOptions } from '@/lib/frequency-pdf-options.mjs';

const fieldNames: Record<FrequencyPdfField, string> = {rank: '排名', reading: '读音', level: '参考等级', pos: '词性', occurrences: '出现次数', questions: '覆盖题目', papers: '覆盖场次', meaning: '中文释义', usage: '用法／接续', source: '释义来源'};
const selectClass = 'mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';

export default function FrequencyPdfOptionsDialog({options, onChange, onExport, onClose, busy, error}: {
  options: FrequencyPdfOptions; onChange: (value: FrequencyPdfOptions) => void;
  onExport: () => void; onClose: () => void; busy: boolean; error?: string;
}) {
  const {t} = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="pdf-export-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
    <div className="flex items-center justify-between gap-3"><h2 id="pdf-export-title" className="text-lg font-bold">{t('PDF 导出设置')}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={t('关闭')} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200">✕</button></div>
    <form onSubmit={event => { event.preventDefault(); onExport(); }}>
      <label className="mt-5 block text-xs font-semibold text-slate-600">{t('排版格式')}<select aria-label={t('排版格式')} className={selectClass} value={options.layout} onChange={event => onChange({...options, layout: event.target.value as FrequencyPdfOptions['layout']})}><option value="detailed">{t('详细列表')}</option><option value="table">{t('紧凑表格')}</option></select></label>
      <p className="mt-2 text-xs leading-5 text-slate-500">{t(options.layout === 'table' ? '适合集中对照；字段较多时建议使用横向。' : '释义与用法分行展示，适合阅读和打印。')}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <label className="text-xs font-semibold text-slate-600">{t('纸张')}<select aria-label={t('纸张')} className={selectClass} value={options.paper} onChange={event => onChange({...options, paper: event.target.value as FrequencyPdfOptions['paper']})}><option>A4</option><option>A5</option></select></label>
        <label className="text-xs font-semibold text-slate-600">{t('方向')}<select aria-label={t('方向')} className={selectClass} value={options.orientation} onChange={event => onChange({...options, orientation: event.target.value as FrequencyPdfOptions['orientation']})}><option value="portrait">{t('纵向')}</option><option value="landscape">{t('横向')}</option></select></label>
        <label className="text-xs font-semibold text-slate-600">{t('字号')}<select aria-label={t('字号')} className={selectClass} value={options.fontSize} onChange={event => onChange({...options, fontSize: Number(event.target.value) as FrequencyPdfOptions['fontSize']})}>{[9, 11, 13].map(size => <option key={size} value={size}>{size} pt</option>)}</select></label>
      </div>
      <fieldset className="mt-5"><legend className="text-sm font-semibold">{t('显示内容')}</legend><p className="mt-1 text-xs leading-5 text-slate-500">{t('词条始终显示，其余内容按需勾选。')}</p><div className="mt-3 grid grid-cols-2 gap-2">{frequencyPdfFields.map(field => <label key={field} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={options.fields.includes(field)} onChange={event => onChange({...options, fields: event.target.checked ? [...options.fields, field] : options.fields.filter(value => value !== field)})} className="h-4 w-4 accent-indigo-600" />{t(fieldNames[field])}</label>)}</div></fieldset>
      <p className="mt-4 text-xs leading-5 text-slate-500">{t('按当前筛选与排序导出全部结果；来源与许可说明保留在文档开头。')}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{t(error)}</p>}
      <div className="sticky bottom-0 mt-5 flex items-center justify-between gap-3 bg-white pt-3"><button type="button" onClick={() => onChange({...defaultFrequencyPdfOptions, fields: [...defaultFrequencyPdfOptions.fields]})} className="min-h-11 px-2 text-sm font-semibold text-slate-500">{t('恢复默认')}</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{t(busy ? '正在导出……' : '导出 PDF')}</button></div>
    </form>
  </dialog>;
}
