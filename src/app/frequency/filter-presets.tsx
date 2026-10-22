"use client";
import {useState} from 'react';
import FloatingSettings from '@/components/floating-settings';
import {useI18n} from '@/lib/i18n';
import {useTermStudy,saveFrequencyPreset,deleteFrequencyPreset} from '@/lib/term-study-store';

export default function FilterPresets({query,onApply}:{query:string;onApply:(query:string)=>string|null}) {
  const {t}=useI18n(),snapshot=useTermStudy();const [name,setName]=useState(''),[editing,setEditing]=useState<string|null>(null),[message,setMessage]=useState(''),[error,setError]=useState(false);
  const rows=(snapshot.data.presets??[]).filter(row=>!row.deleted).sort((a,b)=>b.updatedAt-a.updatedAt);
  function save(){const result=saveFrequencyPreset(name,query,editing??undefined);setError(!result.ok);setMessage(result.ok?'筛选方案已保存。':result.error??'保存失败。');if(result.ok){setName('');setEditing(null);}}
  return <FloatingSettings title={t('筛选方案')} triggerClassName="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-indigo-600" trigger={<><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h12v18l-6-4-6 4Z"/></svg><span className="hidden sm:inline">{t('筛选方案')}</span></>}>
    <p className="mt-3 text-xs leading-6 text-slate-500">{t('保存当前 Tab、筛选与排序，打开方案即可恢复。可随云备份保存。')}</p>
    <form onSubmit={event=>{event.preventDefault();save();}} className="mt-3 space-y-2"><input aria-label={t('方案名称')} placeholder={t('方案名称')} value={name} maxLength={40} onChange={event=>setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"/><button disabled={!name.trim()||!snapshot.ready||Boolean(snapshot.error)} className="min-h-11 w-full rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white disabled:opacity-40">{t(editing?'更新为当前筛选':'保存当前筛选')}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setName('');}} className="min-h-9 text-xs text-slate-500">{t('取消编辑')}</button>}</form>
    {(message||snapshot.error)&&<p role={error||snapshot.error?'alert':'status'} className={`mt-2 text-xs leading-6 ${error?'text-rose-700':'text-indigo-600'}`}>{t(message||snapshot.error!)}</p>}
    <ul className="mt-3 divide-y divide-slate-100">{rows.map(row=><li key={row.id} className="py-2"><div className="flex items-center justify-between gap-2"><button type="button" className="min-h-10 min-w-0 flex-1 break-words text-left text-sm font-semibold text-indigo-600" onClick={event=>{const failure=onApply(row.query);if(!failure)event.currentTarget.closest<HTMLElement>('[popover]')?.hidePopover();setError(Boolean(failure));setMessage(failure??'已应用筛选方案。');}}>{row.name}</button><button type="button" onClick={()=>{setEditing(row.id);setName(row.name);}} className="min-h-10 px-2 text-xs text-slate-500">{t('编辑')}</button><button type="button" onClick={()=>{if(!window.confirm(t('确定删除这个筛选方案？')))return;const result=deleteFrequencyPreset(row.id);setError(!result.ok);setMessage(result.ok?'筛选方案已删除。':result.error??'保存失败。');if(editing===row.id){setEditing(null);setName('');}}} className="min-h-10 px-2 text-xs text-rose-700">{t('删除')}</button></div></li>)}</ul>{!rows.length&&<p className="mt-3 text-xs text-slate-500">{t('还没有保存的筛选方案。')}</p>}
  </FloatingSettings>;
}
