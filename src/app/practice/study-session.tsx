"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PracticePaper } from "@/data/practice-papers";
import type { PracticeMode } from "@/data/practice-modes";
import { createStudyAttempt, matchesStudyPaper, readStudySnapshot, type StudyAttempt } from "@/lib/study-store";
import PracticeExercise from "./practice-exercise";
import ExamSession from "./exam-session";

interface Props { paper: PracticePaper; mode: PracticeMode; initialQuestionIndex?: number; requestedQuestion?: boolean }
export default function StudySession({ paper, mode, initialQuestionIndex = 0, requestedQuestion }: Props) {
  const { t } = useI18n();
  const params = useSearchParams();
  // Next preserves page state during back/forward navigation. The URL must select
  // the saved attempt even when a previous exercise component is being reused.
  const attemptId = params.get("attempt") ?? undefined;
  const fresh = params.get("fresh") === "1";
  const requested = requestedQuestion && params.has("question");
  const initialized = useRef<string | null>(null);
  const [session, setSession] = useState<{ attempt: StudyAttempt; error: string | null; index: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const target = `${paper.id}:${mode}:${attemptId ?? (fresh ? "new" : "resume")}`;
    if (initialized.current === target) return;
    initialized.current = target;
    const snapshot = readStudySnapshot();
    const saved = attemptId ? snapshot.data.attempts.find(a => a.id === attemptId) : !fresh ? [...snapshot.data.attempts].filter(a => a.status !== "completed" && matchesStudyPaper(a, paper, mode)).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
    if (attemptId && (!saved || !matchesStudyPaper(saved, paper, mode))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Read browser storage only after hydration, before mounting the exercise.
      setMessage(snapshot.error ?? "这份作答记录不存在或题库已更新，无法恢复。历史成绩仍可在学习记录中查看。");
      return;
    }
    const created = saved ? { attempt: saved, error: snapshot.error } : createStudyAttempt(paper, mode);
    setMessage(null);
    setSession({ ...created, index: requested ? initialQuestionIndex : created.attempt.questionIndex });
    initialized.current = `${paper.id}:${mode}:${created.attempt.id}`;
    const url = new URL(window.location.href);
    url.searchParams.set("attempt", created.attempt.id);
    url.searchParams.delete("fresh");
    url.searchParams.delete("question");
    window.history.replaceState(null, "", url);
  }, [attemptId, fresh, initialQuestionIndex, mode, paper, requested]);
  function restart() {
    const created = createStudyAttempt(paper, mode);
    initialized.current = `${paper.id}:${mode}:${created.attempt.id}`;
    setSession({ ...created, index: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("attempt", created.attempt.id);
    window.history.replaceState(null, "", url);
  }
  if (message) return <main className="mx-auto max-w-xl p-8"><p role="alert">{t(message)}</p><div className="mt-5 flex gap-5"><Link href="/history" className="text-indigo-600">{t("查看学习记录")}</Link><Link href="/" className="text-indigo-600">{t("返回首页")}</Link></div></main>;
  if (!session || attemptId && session.attempt.id !== attemptId) return <LoadingSkeleton label="正在恢复学习进度……" variant="question" fullPage />;
  const props = { paper, attempt: session.attempt, initialSaveError: session.error, initialQuestionIndex: session.index, onRestart: restart };
  return mode === "exam" ? <ExamSession key={session.attempt.id} {...props} /> : <PracticeExercise key={session.attempt.id} {...props} />;
}
