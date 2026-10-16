"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import Link from "next/link";
import FavoriteButton from "@/components/favorite-button";
import QuestionBody from "@/components/question-body";
import RichContent from "@/components/rich-content";
import { formatPeriod } from "@/data/bank-catalog";
import type { CatalogQuestion } from "@/data/practice-papers";
import type { CollectionView } from "./review-selection";

export function favoriteTitle(item: CatalogQuestion) {
  const q = item.question, number = q.sourceQuestionNumber ?? q.id.match(/(\d+)$/)?.[1];
  return `${q.level} · ${formatPeriod(item.year)} · ${q.category}${number != null ? ` · ${q.sourceQuestionNumber != null ? "原题号" : "题号"} ${number}` : ""}`;
}

export default function FavoriteQuestion({ questionId, item, folderName, loading, onBack, collectionView = "favorites", wrongCount }: { questionId: string; item?: CatalogQuestion; folderName: string; loading: boolean; onBack: () => void; collectionView?: CollectionView; wrongCount?: number }) {
  const { t } = useI18n();
  const q = item?.question;
  const explanation = q && <><p className="text-sm font-semibold">{t("正确答案：")}{q.options.find(option => option.id === q.correctOptionId)?.label ?? q.correctOptionId}</p>{q.explanation.map((text, index) => <RichContent key={index} text={text} html={q.richText} className="question-text mt-2 text-slate-700" />)}</>;
  return <article data-question-id={questionId} className="favorite-question relative rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <button type="button" onClick={onBack} className="mb-3 min-h-11 text-sm font-semibold text-indigo-600 lg:hidden">{t("← 返回一览")}</button>
    <h2 tabIndex={-1} className="favorite-detail-title pr-12 text-sm font-semibold leading-6 text-slate-700 outline-none">{t(item ? favoriteTitle(item) : loading ? "正在读取收藏题目" : "收藏的题目暂不可用")}</h2>
    <p className="mt-1 pr-10 text-xs leading-5 text-slate-400">{folderName}{t(item && ` · ${item.source === "imported" ? "用户提供题库" : "原创模拟题库"}`)}</p>
    {wrongCount !== undefined && <p className="mt-2 text-xs text-rose-600">{t("答错 {count} 次", { count: wrongCount })}</p>}
    <FavoriteButton questionId={questionId} />
    {!q && loading ? <LoadingSkeleton label="正在读取收藏题目" variant="question" /> : !q ? <p className="mt-4 break-words text-sm leading-7 text-slate-500">{questionId}{t("。收藏记录已保留，可通过星标管理收藏。")}</p> : <>
      <QuestionBody question={q} />
      <ol lang="ja" className="mt-4 grid gap-2">{q.options.map(option => <li key={option.id} className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-3"><span className="pt-0.5 text-sm font-semibold text-slate-500">{option.label ?? option.id}.</span><RichContent text={option.text} html={q.richText} className="question-text flex-1" /></li>)}</ol>
      <details className="mt-4 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-indigo-700">{t("查看答案与解析")}</summary><div className="mt-3">{explanation}</div></details>
      <div className="mt-4 flex flex-wrap items-center gap-4"><Link href={`/favorites/practice?${new URLSearchParams({ view: collectionView, question: q.id, ...(collectionView !== "favorites" ? { fresh: "1" } : {}) })}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600">{t("练习本题 →")}</Link></div>
    </>}
  </article>;
}
