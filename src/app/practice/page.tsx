import type { Metadata } from "next";
import ActivationForm from "@/components/activation-form";
import { isActivated, practiceReturnPath } from "@/lib/activation.server";
import Link from "next/link";
import { Suspense } from "react";
import { levels, type JLPTLevel } from "@/data/practice-question";
import { questionTypes, type QuestionType } from "@/data/practice-papers";
import { getBankLevels, getBankPeriods, type QuestionBankSource } from "@/data/bank-catalog";
import { loadPracticePaper } from "@/data/imported-papers.server";
import StudySession from "./study-session";
import { practiceModes, type PracticeMode } from "@/data/practice-modes";

export const metadata: Metadata = {
  title: "日语题库练习 | JLPT Practice",
};

function isLevel(value: string | string[] | undefined): value is JLPTLevel {
  return levels.some((level) => level === value);
}

function isQuestionType(value: string | string[] | undefined): value is QuestionType {
  return questionTypes.some((type) => type.value === value);
}

function isPracticeMode(value: string | string[] | undefined): value is PracticeMode {
  return practiceModes.some((mode) => mode.value === value);
}

function InvalidSelection() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-2xl font-bold">未找到这份练习卷</h1>
        <p className="mt-4 leading-7 text-slate-600">请选择有效的等级、年份版本、题型、作答模式和题目。</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-indigo-600 underline">返回首页重新选择</Link>
      </div>
    </main>
  );
}

async function SelectedExercise({ searchParams }: PageProps<"/practice">) {
  const params = await searchParams;
  if (!await isActivated()) return <ActivationForm returnTo={practiceReturnPath("/practice", params)} />;
  const level = params.level ?? "N2";
  const sourceInput = params.source ?? (typeof params.year === "string" && /^\d{6}$/.test(params.year) ? "imported" : "original");
  if (sourceInput !== "original" && sourceInput !== "imported" || !isLevel(level)) return <InvalidSelection />;
  const source: QuestionBankSource = sourceInput;
  const year = params.year ?? getBankPeriods(source, level)[0];
  const type = params.type ?? "all";
  const mode = params.mode ?? "practice";

  if (typeof year !== "string" || !getBankLevels(source).includes(level) || !getBankPeriods(source, level).includes(year) || !isQuestionType(type) || !isPracticeMode(mode)) {
    return <InvalidSelection />;
  }

  const paper = await loadPracticePaper(source, level, year, type);
  if (paper.questions.length === 0) return <InvalidSelection />;
  const questionId = params.question;
  const initialQuestionIndex = typeof questionId === "string" ? paper.questions.findIndex((question) => question.id === questionId) : 0;
  if (questionId !== undefined && (typeof questionId !== "string" || initialQuestionIndex < 0)) return <InvalidSelection />;
  const attemptId = typeof params.attempt === "string" ? params.attempt : undefined;
  return <StudySession key={`${paper.id}-${mode}-${attemptId ?? ""}-${params.fresh ?? ""}-${questionId ?? ""}`} paper={paper} mode={mode} initialQuestionIndex={initialQuestionIndex} requestedQuestion={questionId !== undefined} />;
}

export default function PracticePage(props: PageProps<"/practice">) {
  return (
    <Suspense fallback={<p role="status" className="p-8">正在准备练习卷……</p>}>
      <SelectedExercise {...props} />
    </Suspense>
  );
}
