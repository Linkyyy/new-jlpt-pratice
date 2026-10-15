"use client";

import { useI18n } from "@/lib/i18n";
import { translatePeriod } from "@/lib/i18n/translate";

import Link from "next/link";
import type { Locale } from "@/lib/display-preferences";
import { studyAttemptUrl, studyScore, studySummary, type StudyAttempt, type StudyData } from "@/lib/study-store";

export const studyCard = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";
export function attemptTitle(attempt: StudyAttempt, t: (text: string) => string = text => text) {
  const period = translatePeriod(attempt.periodLabel, attempt.source, t);
  return `${t(attempt.level)} · ${period} · ${t(attempt.typeLabel)}`;
}
export function studyDate(time: number, locale: Locale = "zh") { return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time); }
export function AttemptCard({ attempt }: { attempt: StudyAttempt }) {
  const { t, locale } = useI18n();
  const score = studyScore(attempt), completed = attempt.status === "completed";
  const chosen = Object.keys(attempt.answers).length;
  return <article className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="min-w-0 flex-1">
      <Link href={`/history/${encodeURIComponent(attempt.id)}`} className="block text-sm font-semibold leading-6 text-slate-900 hover:text-indigo-600">{attemptTitle(attempt, t)}</Link>
      <p className="mt-1 text-xs leading-5 text-slate-500">{studyDate(attempt.completedAt ?? attempt.updatedAt, locale)} · {t(attempt.mode === "exam" ? "考试" : "练习")} · {t(completed ? `答对 ${score.correct}/${score.total} 题` : attempt.status === "ready" ? "待开始" : `已${attempt.mode === "exam" ? "选择" : "提交"} ${attempt.mode === "exam" ? chosen : score.answered}/${score.total} 题`)}</p>
    </div>
    <div className="shrink-0 text-right">
      {completed && <p className="text-lg font-bold tabular-nums text-indigo-600">{score.score}<span className="ml-0.5 text-sm font-normal">/ {score.maxScore}</span></p>}
      <div className="flex items-center justify-end gap-2"><Link href={studyAttemptUrl(attempt)} className="inline-flex min-h-9 items-center text-sm font-semibold text-indigo-600 hover:underline">{t(completed ? "复习 →" : "继续 →")}</Link></div>
    </div>
  </article>;
}
export function StudyStats({ data, ready }: { data: StudyData; ready: boolean }) {
  const { t } = useI18n();
  const summary = studySummary(data);
  return <section aria-label={t("学习概况")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {[
      ["已练题目", summary.unique, "题"], ["完成练习 / 考试", summary.completed, "次"], ["作答正确率", summary.accuracy, "%"], ["连续学习", summary.streak, "天"],
    ].map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs text-slate-500 sm:text-sm">{t(label)}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{ready ? value : "—"}<span className="ml-1.5 text-xs font-normal text-slate-500">{t(unit)}</span></p></div>)}
  </section>;
}
