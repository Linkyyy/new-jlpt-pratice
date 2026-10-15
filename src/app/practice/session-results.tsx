"use client";

import { useI18n } from "@/lib/i18n";
import { translatePeriod } from "@/lib/i18n/translate";

import ScoreReport from "@/components/score-report";
import { calculatePracticeScore } from "@/lib/practice-scoring";
import Link from "next/link";
import QuestionOverview from "./question-overview";
import { useState, type RefObject } from "react";
import { saveFavorites, useFavorites } from "@/lib/favorites-store";
import { type OptionId } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";
import { formatDuration } from "@/data/practice-modes";

export type SelectedAnswers = Partial<Record<string, OptionId>>;

interface SessionResultsProps {
  paper: PracticePaper;
  answers: SelectedAnswers;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onReview: (index: number) => void;
  onRestart: () => void;
  exam?: { elapsedSeconds: number; timedOut: boolean };
}

export default function SessionResults({ paper, answers, headingRef, onReview, onRestart, exam }: SessionResultsProps) {
  const { t } = useI18n();
  const { data, ready, error: storageError } = useFavorites();
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const wrongIds = paper.questions.filter((question) => answers[question.id] !== undefined && answers[question.id] !== question.correctOptionId).map((question) => question.id);
  const unsavedWrong = wrongIds.filter((id) => !data.entries.some((entry) => entry.questionId === id));

  function favoriteWrongQuestions() {
    const result = saveFavorites(wrongIds);
    if (!result.ok) { setFavoriteError(result.error); return; }
    setFavoriteError(null);
    setFavoriteMessage(`已新增收藏 ${result.addedCount ?? 0} 道错题，已有收藏保持不变。`);
  }

  const result = calculatePracticeScore({ ...paper, fullPaper: paper.source !== "favorites" && paper.id.endsWith("-all") }, answers);
  const { total, correct, unanswered } = result;
  const wrong = total - correct - unanswered;

  return (
    <section aria-labelledby="results-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h1 ref={headingRef} tabIndex={-1} id="results-title" className="scroll-mt-6 text-2xl font-bold outline-none">{t(exam ? "考试已交卷" : "练习已完成")}</h1>
      <p className="mt-2 text-sm text-slate-500">{t(paper.level)} · {translatePeriod(paper.periodLabel ?? `${paper.year} 原创版`, paper.source, t)} · {t(paper.sourceLabel ?? "原创模拟题库")} · {t(paper.typeLabel)} · {t(exam ? "考试模式" : "练习模式")}</p>
      {exam && <p role="status" className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">{t(exam.timedOut ? "时间已到，已自动交卷。未作答题目按未得分计算。" : "已提交整份试卷，答案已锁定。")} {t("作答用时：{0}", { 0: formatDuration(exam.elapsedSeconds) })}</p>}
      <ScoreReport result={result} />
      <p className="mt-4 text-sm leading-6 text-slate-600">{t("答对 {0} 题，答错 {1} 题，未作答 {2} 题，共 {3} 题。", { 0: correct, 1: wrong, 2: unanswered, 3: total })} · {t("正确率")} {result.percent}%</p>
      <div className="mt-5">
        <button type="button" onClick={favoriteWrongQuestions} disabled={!ready || storageError !== null || unsavedWrong.length === 0} className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">{t(wrongIds.length === 0 ? "暂无错题可收藏" : unsavedWrong.length === 0 ? "错题已全部收藏" : `一键收藏错题（${unsavedWrong.length}）`)}</button>
        <p className="mt-2 text-xs leading-6 text-slate-500">{t("新收藏放入默认收藏夹，已收藏题目保留原有收藏夹。未作答题目不计入错题收藏。")}</p>
        <p role="status" className="mt-1 text-sm text-slate-600">{t(favoriteMessage)}</p>
        {(favoriteError || storageError) && <p role="alert" className="mt-1 text-sm text-rose-700">{t(favoriteError ?? storageError)}</p>}
      </div>
      <h2 className="mt-7 font-bold">{t("逐题回顾")}</h2>
      <p className="mt-2 text-xs leading-6 text-slate-500">{t("绿色为答对，红色为答错，灰色为未作答。点击题号查看答案与解析。")}</p>
      <QuestionOverview questions={paper.questions} onSelect={onReview} label={t("逐题回顾")} results getStatus={(question) => answers[question.id] === undefined ? "empty" : answers[question.id] === question.correctOptionId ? "correct" : "incorrect"} />
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onRestart} className="min-h-12 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{t(exam ? "重新考试" : "重新练习")}</button>
        <Link href={paper.source === "favorites" ? "/favorites" : "/"} className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{t(paper.source === "favorites" ? "返回收藏题库" : "选择其他练习")}</Link>
        <Link href="/history" className="min-h-12 rounded-xl px-5 py-3 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50">{t("查看学习记录")}</Link>
      </div>
    </section>
  );
}
