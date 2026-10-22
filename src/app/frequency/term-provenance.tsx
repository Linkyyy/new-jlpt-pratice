"use client";
import {useI18n} from '@/lib/i18n';
import type {FrequencyResult} from '@/lib/bank-frequency.mjs';
export default function TermProvenance({detail}:{detail:NonNullable<FrequencyResult['detail']>}) {
  const {t}=useI18n();
  const sources=detail.referenceEvidence??[];
  return <details className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-xs leading-6"><summary className="cursor-pointer font-semibold text-slate-600">{t('释义与分级来源')}</summary><div className="mt-2 space-y-2 text-slate-500"><p>{t('释义来源')}：{t(detail.definition.source==='wiktionary'?'中文维基词典 · CC BY-SA 4.0':detail.definition.source==='editorial'?'站内学习释义；具体含义请结合原题。':'未收录可靠释义，暂不自动推测。')}</p><p>{t('分级依据')}：{t(detail.referenceBasis==='editorial'?'站内学习估级':detail.referenceBasis==='supplemental'?'补充词表与整词核对':detail.referenceLevels.length?'公开参考词表':'未找到可靠的整词分级依据')}</p>{sources.map((source,index)=><p key={`${source.name}:${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{source.name}</a> · {source.levels.join(' / ')}<span className="block break-all text-slate-400">{t('来源版本')} {source.revision?.slice(0,12)} · {source.license}</span></p>)}<p>{t('参考等级不是官方分级，也不根据词条所在试卷等级推断。')}</p>{!!detail.review?.reasons.length&&<ul className="space-y-1 border-t border-slate-100 pt-2">{detail.review.reasons.map(reason=><li key={reason}>{t(reason)}</li>)}</ul>}</div></details>;
}
