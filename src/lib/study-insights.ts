import type { JLPTLevel, QuestionCategory } from "@/data/practice-question";
import type { StudyAttempt, StudyData } from "./study-store";

const DAY = 86_400_000;
const JST_OFFSET = 9 * 60 * 60 * 1000;
const CATEGORIES: readonly QuestionCategory[] = ["词汇", "语法", "阅读", "听力"];
const CORRECT_INTERVALS = [3, 7, 14, 30, 60] as const;

export interface QuestionInsight {
  readonly questionId: string;
  readonly level: JLPTLevel;
  readonly category: QuestionCategory;
  readonly answeredCount: number;
  readonly correctCount: number;
  readonly wrongCount: number;
  readonly lastCorrect: boolean;
  readonly lastAnsweredAt: number;
  readonly consecutiveCorrect: number;
  readonly dueAt: number;
  readonly reviewStatus: "due" | "scheduled" | "mastered";
}

export interface CategoryInsight {
  readonly category: QuestionCategory;
  readonly answered: number;
  readonly correct: number;
  readonly wrong: number;
  readonly accuracy: number;
}

export interface StudyPeriodMetrics {
  /** Distinct sessions containing at least one graded answer in this period. */
  readonly practiceCount: number;
  readonly answered: number;
  readonly correct: number;
  readonly accuracy: number;
  readonly completed: number;
  readonly studyDays: number;
  readonly categories: readonly CategoryInsight[];
}

export interface StudyWeeklyReport {
  /** JST Monday midnight, inclusive. */
  readonly weekStart: number;
  /** Report cutoff (now), inclusive; the week is still in progress. */
  readonly weekEnd: number;
  readonly previousWeekStart: number;
  readonly current: StudyPeriodMetrics;
  /** The full previous JST Monday–Sunday week. */
  readonly previous: StudyPeriodMetrics;
  readonly weakCategories: readonly CategoryInsight[];
  /** New answers use submittedAt; legacy snapshots use completion/update time. */
  readonly timeBasis: "answer-or-attempt";
}

export interface StudyRecommendations {
  readonly dueQuestionIds: readonly string[];
  /** Currently incorrect questions, most frequently missed first. */
  readonly wrongQuestionIds: readonly string[];
  /** At least three graded answers and accuracy below 80%. */
  readonly weakCategories: readonly CategoryInsight[];
  readonly suggestedCategory: QuestionCategory | null;
}

function percent(correct: number, answered: number): number {
  return answered ? Math.round(correct / answered * 100) : 0;
}

function jstDay(time: number): string {
  return new Date(time + JST_OFFSET).toISOString().slice(0, 10);
}

function fallbackAnswerTime(attempt: StudyAttempt): number {
  return attempt.completedAt ?? attempt.updatedAt;
}

interface AnswerEvent {
  readonly questionId: string;
  readonly level: JLPTLevel;
  readonly category: QuestionCategory;
  readonly attemptId: string;
  readonly attemptCreatedAt: number;
  readonly time: number;
  readonly correct: boolean;
}

/**
 * Old records only retain the latest session snapshot. Fall back to its
 * completion or update time without inventing exact submission dates. Never
 * grade an unfinished exam, even if a legacy draft says submitted=true.
 * Answer keys always come from the saved attempt, never the current bank.
 */
function answerEvents(data: StudyData, now: number): AnswerEvent[] {
  const events: AnswerEvent[] = [];
  for (const attempt of data.attempts) {
    if (attempt.mode === "exam" && (attempt.status !== "completed" || fallbackAnswerTime(attempt) > now)) continue;
    const seen = new Set<string>();
    for (const question of attempt.questions) {
      const answer = attempt.answers[question.id];
      if (seen.has(question.id) || !answer?.submitted) continue;
      seen.add(question.id);
      const time = answer.submittedAt ?? fallbackAnswerTime(attempt);
      if (time > now) continue;
      events.push({ questionId: question.id, level: question.level, category: question.category,
        attemptId: attempt.id, attemptCreatedAt: attempt.createdAt, time,
        correct: answer.selectedOptionId === question.correctOptionId });
    }
  }
  return events.sort((a, b) => a.time - b.time || a.attemptCreatedAt - b.attemptCreatedAt || a.attemptId.localeCompare(b.attemptId) || a.questionId.localeCompare(b.questionId));
}

/** Pure, read-only analytics. Callers supply a stable clock after hydration. */
export function buildQuestionInsights(data: StudyData, now: number): Map<string, QuestionInsight> {
  const insights = new Map<string, QuestionInsight>();
  for (const event of answerEvents(data, now)) {
    const prior = insights.get(event.questionId);
    const consecutiveCorrect = event.correct ? (prior?.consecutiveCorrect ?? 0) + 1 : 0;
    const interval = event.correct ? CORRECT_INTERVALS[Math.min(consecutiveCorrect, CORRECT_INTERVALS.length) - 1] : 1;
    const dueAt = event.time + interval * DAY;
    insights.set(event.questionId, {
      questionId: event.questionId, level: event.level, category: event.category,
      answeredCount: (prior?.answeredCount ?? 0) + 1,
      correctCount: (prior?.correctCount ?? 0) + Number(event.correct),
      wrongCount: (prior?.wrongCount ?? 0) + Number(!event.correct),
      lastCorrect: event.correct, lastAnsweredAt: event.time, consecutiveCorrect, dueAt,
      reviewStatus: dueAt <= now ? "due" : consecutiveCorrect >= 3 ? "mastered" : "scheduled",
    });
  }
  return insights;
}

function dueQuestionIds(insights: ReadonlyMap<string, QuestionInsight>, now: number): string[] {
  return [...insights.values()]
    .filter(question => question.wrongCount > 0 && question.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt || b.wrongCount - a.wrongCount || a.questionId.localeCompare(b.questionId))
    .map(question => question.questionId);
}

export function getDueReviewQuestionIds(data: StudyData, now: number): string[] {
  return dueQuestionIds(buildQuestionInsights(data, now), now);
}

function categoryMetrics(events: readonly AnswerEvent[]): CategoryInsight[] {
  const counts = new Map(CATEGORIES.map(category => [category, { answered: 0, correct: 0 }]));
  for (const event of events) {
    const count = counts.get(event.category)!;
    count.answered++;
    count.correct += Number(event.correct);
  }
  return CATEGORIES.map(category => {
    const { answered, correct } = counts.get(category)!;
    return { category, answered, correct, wrong: answered - correct, accuracy: percent(correct, answered) };
  });
}

function weakCategories(categories: readonly CategoryInsight[], minimumAnswers: number): CategoryInsight[] {
  return categories.filter(category => category.answered >= minimumAnswers && category.correct / category.answered < .8)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category));
}

function periodMetrics(data: StudyData, events: readonly AnswerEvent[], start: number, end: number, inclusiveEnd: boolean): StudyPeriodMetrics {
  const inPeriod = (time: number) => time >= start && (inclusiveEnd ? time <= end : time < end);
  const selected = events.filter(event => inPeriod(event.time));
  const categories = categoryMetrics(selected);
  const answered = categories.reduce((sum, category) => sum + category.answered, 0);
  const correct = categories.reduce((sum, category) => sum + category.correct, 0);
  const activityDays = new Set(data.activityDays.filter(day => {
    const dayStart = Date.parse(`${day}T00:00:00+09:00`);
    return inPeriod(dayStart);
  }));
  const completed = data.attempts.filter(attempt => attempt.status === "completed" && inPeriod(fallbackAnswerTime(attempt)));
  for (const event of selected) activityDays.add(jstDay(event.time));
  for (const attempt of completed) activityDays.add(jstDay(fallbackAnswerTime(attempt)));
  return { practiceCount: new Set(selected.map(event => event.attemptId)).size, answered, correct, accuracy: percent(correct, answered), completed: completed.length, studyDays: activityDays.size, categories };
}

export function getStudyWeeklyReport(data: StudyData, now: number): StudyWeeklyReport {
  const jst = new Date(now + JST_OFFSET);
  const daysSinceMonday = (jst.getUTCDay() + 6) % 7;
  const weekStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - daysSinceMonday) - JST_OFFSET;
  const previousWeekStart = weekStart - 7 * DAY;
  const events = answerEvents(data, now);
  const current = periodMetrics(data, events, weekStart, now, true);
  const previous = periodMetrics(data, events, previousWeekStart, weekStart, false);
  return { weekStart, weekEnd: now, previousWeekStart, current, previous, weakCategories: weakCategories(current.categories, 3), timeBasis: "answer-or-attempt" };
}

export function getStudyRecommendations(data: StudyData, now: number): StudyRecommendations {
  const insights = buildQuestionInsights(data, now);
  const weak = weakCategories(categoryMetrics(answerEvents(data, now)), 3);
  const wrongQuestionIds = [...insights.values()].filter(question => !question.lastCorrect)
    .sort((a, b) => b.wrongCount - a.wrongCount || a.lastAnsweredAt - b.lastAnsweredAt || a.questionId.localeCompare(b.questionId))
    .map(question => question.questionId);
  return { dueQuestionIds: dueQuestionIds(insights, now), wrongQuestionIds, weakCategories: weak, suggestedCategory: weak[0]?.category ?? null };
}
