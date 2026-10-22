"use client";
import {useI18n} from '@/lib/i18n';
import type {FrequencyExample} from '@/lib/bank-frequency.mjs';
type Excerpt=NonNullable<NonNullable<FrequencyExample['preview']>['excerpts']>[number];
export default function SourceExcerpt({excerpt}:{excerpt:Excerpt}) {
  const {t}=useI18n();const parts=[];let offset=0;
  for(const match of excerpt.matches){if(match.start>offset)parts.push(excerpt.text.slice(offset,match.start));parts.push(<mark key={`${match.start}:${match.end}`} className="rounded-sm bg-indigo-100 px-0.5 font-semibold text-indigo-900">{excerpt.text.slice(match.start,match.end)}</mark>);offset=match.end;}
  parts.push(excerpt.text.slice(offset));
  return <blockquote className="mt-3 rounded-lg border-l-2 border-indigo-300 bg-white px-3 py-2"><p className="mb-1 text-xs text-slate-500">{t('原题例句')} · {t(({prompt:'题干',passage:'文章',transcript:'听力原文',options:'选项'} as Record<string,string>)[excerpt.field]??excerpt.field)}{excerpt.option?` ${excerpt.option}`:''}</p><p lang="ja" className="whitespace-pre-line break-words text-sm leading-7 text-slate-900">{parts}</p></blockquote>;
}
