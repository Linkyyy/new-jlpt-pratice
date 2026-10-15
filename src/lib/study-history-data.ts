import type { StudyData } from "./study-store";

/** Remove only attempts. Aggregate learning days are cleared with the final attempt. */
export function withoutStudyHistory(data: StudyData, attemptId: string | null): StudyData {
  const attempts = attemptId === null ? [] : data.attempts.filter(attempt => attempt.id !== attemptId);
  if (attemptId !== null && attempts.length === data.attempts.length) return data;
  return { ...data, attempts, activityDays: attempts.length ? data.activityDays : [] };
}
