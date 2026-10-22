"use client";

import FloatingSettings from '@/components/floating-settings';
import {useI18n} from '@/lib/i18n';
import {defaultFrequencyDisplay, setUserPreferences, useUserPreferences} from '@/lib/user-preferences';

export default function FrequencyDisplaySettings({compact = false}: {compact?: boolean}) {
  const {t} = useI18n(), preferences = useUserPreferences();
  const settings = preferences.data.frequency ?? defaultFrequencyDisplay;
  return <FloatingSettings title={t('词条显示设置')} triggerClassName={`inline-flex shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 ${compact ? 'h-11 w-7 sm:w-11' : 'h-11 w-11'}`}>
    <div className="mt-4 space-y-3">{([['examplesExpanded', '默认展开原题例句'], ['previewsExpanded', '默认展开题目预览']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm"><input type="checkbox" checked={settings[key]} disabled={!preferences.ready} onChange={event => setUserPreferences('frequency', {[key]: event.target.checked})} className="h-4 w-4 accent-indigo-600"/>{t(label)}</label>)}</div>
    {preferences.error && <p role="alert" className="mt-3 text-xs text-rose-700">{t(preferences.error)}</p>}
  </FloatingSettings>;
}
