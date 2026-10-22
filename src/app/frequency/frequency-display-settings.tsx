"use client";

import FloatingSettings from '@/components/floating-settings';
import type {ReactNode} from 'react';
import {useI18n} from '@/lib/i18n';
import {defaultFrequencyDisplay, setUserPreferences, useUserPreferences} from '@/lib/user-preferences';

export default function FrequencyDisplaySettings({compact = false,children}: {compact?: boolean;children?: ReactNode}) {
  const {t} = useI18n(), preferences = useUserPreferences();
  const settings = preferences.data.frequency ?? defaultFrequencyDisplay;
  const title=t(children?'筛选与设置':'词条显示设置');
  return <FloatingSettings title={title} triggerClassName={`inline-flex shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 ${children ? 'h-11 gap-1.5 px-2 text-xs font-semibold' : compact ? 'h-11 w-7 sm:w-11' : 'h-11 w-11'}`} trigger={children?<><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--surface)"/><circle cx="15" cy="17" r="3" fill="var(--surface)"/></svg><span className="whitespace-nowrap">{title}</span></>:undefined}>
    {children&&<div className="mt-4">{children}</div>}
    <div className="mt-4 space-y-3">{([['examplesExpanded', '默认展开原题例句'], ['previewsExpanded', '默认展开题目预览']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm"><input type="checkbox" checked={settings[key]} disabled={!preferences.ready} onChange={event => setUserPreferences('frequency', {[key]: event.target.checked})} className="h-4 w-4 accent-indigo-600"/>{t(label)}</label>)}</div>
    {preferences.error && <p role="alert" className="mt-3 text-xs text-rose-700">{t(preferences.error)}</p>}
  </FloatingSettings>;
}
