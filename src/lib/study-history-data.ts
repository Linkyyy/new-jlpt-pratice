import type { StudyData } from "./study-store";

/** Clear all attempts and learning days; individual records cannot be deleted. */
export function withoutStudyHistory(data: StudyData): StudyData {
  return { ...data, attempts: [], activityDays: [] };
}
