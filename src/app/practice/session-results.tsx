"use client";

import Link from "next/link";
import QuestionOverview from "./question-overview";
import { useState, type RefObject } from "react";
import { saveFavorites, useFavorites } from "@/lib/favorites-store";
import { questionCategories, type OptionId } from "@/data/practice-question";
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

  const total = paper.questions.length;
  const correct = paper.questions.filter((question) => answers[question.id] === question.correctOptionId).length;
  const unanswered = paper.questions.filter((question) => answers[question.id] === undefined).length;
  const wrong = total - correct - unanswered;

  return (
    <section aria-labelledby="results-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <h1 ref={headingRef} tabIndex={-1} id="results-title" className="scroll-mt-6 text-2xl font-bold outline-none">{exam ? "考试已交卷" : "练习已完成"}</h1>
      <p className="mt-2 text-sm text-slate-500">{paper.level} · {paper.periodLabel ?? `${paper.year} 原创版`} · {paper.sourceLabel ?? "原创模拟题库"} · {paper.typeLabel} · {exam ? "考试模式" : "练习模式"}</p>
      {exam && <p role="status" className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">{exam.timedOut ? "时间已到，已自动交卷。未作答题目按未得分计算。" : "已提交整份试卷，答案已锁定。"} 作答用时：{formatDuration(exam.elapsedSeconds)}。</p>}
      <p className="mt-7 text-4xl font-bold text-indigo-600">{Math.round((correct / total) * 100)}% <span className="text-sm font-normal text-slate-500">正确率</span></p>
      <p className="mt-3 text-slate-600">答对 {correct} 题，答错 {wrong} 题，{unanswered > 0 && `未作答 ${unanswered} 题，`}共 {total} 题。</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {questionCategories.map((category) => {
          const questions = paper.questions.filter((question) => question.category === category);
          if (questions.length === 0) return null;
          const categoryCorrect = questions.filter((question) => answers[question.id] === question.correctOptionId).length;
          return <p key={category} className="rounded-xl bg-slate-50 p-4 text-sm">{category}：{categoryCorrect} / {questions.length} · {Math.round((categoryCorrect / questions.length) * 100)}%</p>;
        })}
      </div>
      <p className="mt-5 text-xs leading-6 text-slate-500">正确率以全部题目为分母，未作答题目不计分。这不是 JLPT 官方标准分或合格判定。</p>
      <div className="mt-5">
        <button type="button" onClick={favoriteWrongQuestions} disabled={!ready || storageError !== null || unsavedWrong.length === 0} className="min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">{wrongIds.length === 0 ? "暂无错题可收藏" : unsavedWrong.length === 0 ? "错题已全部收藏" : `一键收藏错题（${unsavedWrong.length}）`}</button>
        <p className="mt-2 text-xs leading-6 text-slate-500">新收藏放入默认收藏夹，已收藏题目保留原有收藏夹。未作答题目不计入错题收藏。</p>
        <p role="status" className="mt-1 text-sm text-slate-600">{favoriteMessage}</p>
        {(favoriteError || storageError) && <p role="alert" className="mt-1 text-sm text-rose-700">{favoriteError ?? storageError}</p>}
      </div>
      <h2 className="mt-7 font-bold">逐题回顾</h2>
      <p className="mt-2 text-xs leading-6 text-slate-500">绿色为答对，红色为答错，灰色为未作答。点击题号查看答案与解析。</p>
      <QuestionOverview questions={paper.questions} onSelect={onReview} label="逐题回顾" results getStatus={(question) => answers[question.id] === undefined ? "empty" : answers[question.id] === question.correctOptionId ? "correct" : "incorrect"} />
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onRestart} className="min-h-12 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{exam ? "重新考试" : "重新练习"}</button>
        <Link href={paper.source === "favorites" ? "/favorites" : "/"} className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{paper.source === "favorites" ? "返回收藏题库" : "选择其他练习"}</Link>
        <Link href="/history" className="min-h-12 rounded-xl px-5 py-3 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50">查看学习记录</Link>
      </div>
    </section>
  );
}
