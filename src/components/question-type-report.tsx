"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { PracticePaper } from "@/data/practice-papers";
import { questionCategories, type OptionId } from "@/data/practice-question";
import { useI18n } from "@/lib/i18n";
import { analyzeQuestionTypes, questionTypePracticeHref, suggestedQuestionTypes, type QuestionTypeAnalysis } from "@/lib/question-type-analysis";

export default function QuestionTypeReport({ paper, answers, onReview }: {
  paper: PracticePaper;
  answers: Readonly<Partial<Record<string, OptionId>>>;
  onReview: (index: number) => void;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => analyzeQuestionTypes(paper.questions, answers), [paper.questions, answers]);
  const suggestions = useMemo(() => suggestedQuestionTypes(groups), [groups]);
  const mixedLevels = new Set(paper.questions.map(question => question.level)).size > 1;
  function label(group: QuestionTypeAnalysis) {
    return group.problemNumber
      ? `${mixedLevels ? `${group.level} · ` : ""}${group.label !== group.category ? `${t(group.label)} · ` : ""}${t("问题{0}", { 0: group.problemNumber })}`
      : t(group.label);
  }
  return <section aria-labelledby="question-type-report-title" className="mt-7 border-t border-slate-200 pt-6">
    <h2 id="question-type-report-title" className="font-bold">{t("题型分析")}</h2>
    <p className="mt-1 text-xs leading-6 text-slate-500">{t("按本次作答统计；题量较少时，建议结合多次练习判断。")}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {questionCategories.map(category => {
        const items = groups.filter(group => group.category === category);
        if (!items.length) return null;
        return <section key={category} aria-label={t("{0}题型分析", { 0: t(category) })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">{t(category)}</h3>
          <ul className="mt-2 divide-y divide-slate-200">
            {items.map(group => <li key={group.key} className="py-3 first:pt-1 last:pb-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-900">{label(group)}</span>
                <span className="shrink-0 font-semibold tabular-nums text-indigo-700">{group.percent}%</span>
              </div>
              <progress aria-label={t("{0}正确率", { 0: label(group) })} value={group.correct} max={group.total} className="mt-2 block h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-500" />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{t("对 {0} · 错 {1} · 未答 {2} · 共 {3} 题", { 0: group.correct, 1: group.wrong, 2: group.unanswered, 3: group.total })}</p>
            </li>)}
          </ul>
        </section>;
      })}
    </div>
    {suggestions.length > 0 && <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <h3 className="text-sm font-semibold text-indigo-800">{t("下一步练什么")}</h3>
      <ul className="mt-2 space-y-4">
        {suggestions.map(group => <li key={group.key}>
          <p className="text-sm font-semibold text-slate-800">{t(group.category)} · {label(group)}</p>
          <p className="mt-1 text-xs leading-6 text-slate-600">{t(group.wrong > 0 ? "先回顾这一题型的错题，再做同类练习巩固。" : "先补完未作答题目，再判断这一题型的掌握情况。")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            {group.firstReviewIndex !== undefined && <button type="button" onClick={() => onReview(group.firstReviewIndex!)} className="inline-flex min-h-10 items-center text-xs font-semibold text-indigo-700 hover:underline">{t(group.wrong > 0 ? "回顾本卷错题" : "查看未作答")}</button>}
            <Link href={questionTypePracticeHref(paper, group)} className="inline-flex min-h-10 items-center text-xs font-semibold text-indigo-700 hover:underline">{t("练习{0}", { 0: t(group.category) })} →</Link>
          </div>
        </li>)}
      </ul>
    </div>}
  </section>;
}
