"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createRandomPeriod, isRandomPeriod } from "@/data/random-practice";
import type { PracticePaper } from "@/data/practice-papers";
import type { PracticeMode } from "@/data/practice-modes";
import { createStudyAttempt, readStudySnapshot, type StudyAttempt } from "@/lib/study-store";
import { restorePracticePaper } from "@/lib/restore-practice-paper";
import PracticeExercise from "./practice-exercise";
import ExamSession from "./exam-session";

interface Props { paper: PracticePaper; mode: PracticeMode; initialQuestionIndex?: number; requestedQuestion?: boolean }
export default function StudySession({ paper, mode, initialQuestionIndex = 0, requestedQuestion }: Props) {
  const { t } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  // Next preserves page state during back/forward navigation. The URL must select
  // the saved attempt even when a previous exercise component is being reused.
  const attemptId = params.get("attempt") ?? undefined;
  const fresh = params.get("fresh") === "1";
  const requested = requestedQuestion && params.has("question");
  const initialized = useRef<string | null>(null);
  const [session, setSession] = useState<{ attempt: StudyAttempt; error: string | null; index: number; paper: PracticePaper } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const target = `${paper.id}:${mode}:${attemptId ?? (fresh ? "new" : "resume")}`;
    if (initialized.current === target) return;
    initialized.current = target;
    const snapshot = readStudySnapshot();
    const saved = attemptId ? snapshot.data.attempts.find(a => a.id === attemptId) : !fresh ? [...snapshot.data.attempts].filter(a => a.status !== "completed" && restorePracticePaper(paper, a, mode) !== null).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined;
    const restoredPaper = saved ? restorePracticePaper(paper, saved, mode) : null;
    if (attemptId && (!saved || !restoredPaper)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Read browser storage only after hydration, before mounting the exercise.
      setMessage(snapshot.error ?? "这份作答记录不存在或题库已更新，无法恢复。历史成绩仍可在学习记录中查看。");
      return;
    }
    const activePaper = restoredPaper ?? paper;
    const requestedIndex = requested ? activePaper.questions.findIndex(q => q.id === paper.questions[initialQuestionIndex]?.id) : null;
    if (requestedIndex === -1) {
      setMessage("这道题不在这次历史作答中，请从学习记录重新选择。");
      return;
    }
    const created = saved ? { attempt: saved, error: snapshot.error } : createStudyAttempt(paper, mode);
    setMessage(null);
    setSession({ ...created, paper: activePaper, index: requestedIndex ?? created.attempt.questionIndex });
    initialized.current = `${paper.id}:${mode}:${created.attempt.id}`;
    const url = new URL(window.location.href);
    url.searchParams.set("attempt", created.attempt.id);
    url.searchParams.delete("fresh");
    url.searchParams.delete("question");
    window.history.replaceState(null, "", url);
  }, [attemptId, fresh, initialQuestionIndex, mode, paper, requested]);
  function restart() {
    if (isRandomPeriod(paper.year)) {
      const search = new URLSearchParams({ source: paper.source ?? "original", level: paper.level, year: createRandomPeriod(), type: session?.attempt.type ?? "vocabulary", mode, fresh: "1" });
      router.push(`/practice?${search}`);
      return;
    }
    const created = createStudyAttempt(paper, mode);
    initialized.current = `${paper.id}:${mode}:${created.attempt.id}`;
    setSession({ ...created, paper, index: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("attempt", created.attempt.id);
    window.history.replaceState(null, "", url);
  }
  if (message) return <main className="mx-auto max-w-xl p-8"><p role="alert">{t(message)}</p><div className="mt-5 flex gap-5"><Link href="/history" className="text-indigo-600">{t("查看学习记录")}</Link><Link href="/" className="text-indigo-600">{t("返回首页")}</Link></div></main>;
  if (!session || attemptId && session.attempt.id !== attemptId) return <LoadingSkeleton label="正在恢复学习进度……" variant="question" fullPage />;
  const props = { paper: session.paper, attempt: session.attempt, initialSaveError: session.error, initialQuestionIndex: session.index, onRestart: restart };
  return mode === "exam" ? <ExamSession key={session.attempt.id} {...props} /> : <PracticeExercise key={session.attempt.id} {...props} />;
}
