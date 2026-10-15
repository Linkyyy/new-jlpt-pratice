"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateStudyAttempt, type StudyAttempt, type StudyPatch } from "@/lib/study-store";

export function useStudyPersistence(attempt: StudyAttempt, state: StudyPatch, initialError: string | null = null) {
  const previous = useRef<StudyPatch>(attempt);
  const [error, setError] = useState(initialError);
  const { answers, status, questionIndex, deadline, elapsedSeconds, timedOut, fontSize, mobileFontSize } = state;
  const save = useCallback(() => {
    const next = { answers, status, questionIndex, deadline, elapsedSeconds, timedOut, fontSize, mobileFontSize };
    const old = previous.current;
    const changes = Object.fromEntries(Object.entries(answers).filter(([id, answer]) => answer?.selectedOptionId !== old.answers[id]?.selectedOptionId || answer?.submitted !== old.answers[id]?.submitted));
    if (!Object.keys(changes).length && status === old.status && questionIndex === old.questionIndex && deadline === old.deadline && elapsedSeconds === old.elapsedSeconds && timedOut === old.timedOut && fontSize === old.fontSize && mobileFontSize === old.mobileFontSize) return;
    const result = updateStudyAttempt(attempt.id, { ...next, answers: changes });
    if (result.ok) { previous.current = next; setError(null); }
    else setError(result.error);
  }, [attempt.id, answers, status, questionIndex, deadline, elapsedSeconds, timedOut, fontSize, mobileFontSize]);
  useEffect(() => { save(); }, [save]);
  useEffect(() => {
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [save]);
  return error;
}
