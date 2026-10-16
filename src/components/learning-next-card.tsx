"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudyClock } from "@/lib/use-study-clock";
import { getStudyRecommendations } from "@/lib/study-insights";
import { latestStudyAttempt, studyAttemptUrl, studyScore, type StudyData } from "@/lib/study-store";
import { attemptTitle } from "./study-dashboard";

export default function LearningNextCard({ data, ready }: { data: StudyData; ready: boolean }) {
  const { t } = useI18n();
  const now = useStudyClock(data);
  const latest = latestStudyAttempt(data);
  const answered = latest ? latest.mode === "exam" ? Object.keys(latest.answers).length : studyScore(latest).answered : 0;
  const advice = useMemo(() => getStudyRecommendations(data, now), [data, now]);
  if (!ready || !now || !data.attempts.length) return null;
  const due = advice.dueQuestionIds.length;
  const weak = advice.weakCategories[0];
  return <section aria-label={t("继续学习与复习")} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:px-6">
    {latest && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="min-w-0 flex-1 basis-40"><p className="text-xs font-semibold text-indigo-600">{t("上次未完成")}</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{attemptTitle(latest, t)}</p><p className="mt-1 text-xs leading-5 text-slate-500">{t(latest.mode === "exam" ? "考试" : "练习")} · {t(latest.mode === "exam" ? "已选择 {0}/{1} 题" : "已提交 {0}/{1} 题", { 0: answered, 1: latest.questions.length })}</p></div><Link href={studyAttemptUrl(latest)} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">{t("继续上次")}</Link></div>}
    <div className={`${latest ? "mt-3 border-t border-indigo-200 pt-3" : ""} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
      <div className="min-w-0 flex-1 basis-40 text-xs leading-6 text-slate-600">
        <p className="font-semibold text-indigo-800">{t(due ? "到期复习" : "学习建议")}</p>
        <p>{due ? t("有 {0} 道错题到期，建议先复习，再开始新题。", { 0: due }) : weak ? t("{0}正确率为 {1}%，建议回顾错题并补充同类练习。", { 0: t(weak.category), 1: weak.accuracy }) : t("保持规律练习；答错后次日复习，连续答对后逐步延长间隔。")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <Link href={due ? "/favorites/practice?view=due&fresh=1" : "/favorites?view=mistakes"} className="inline-flex min-h-11 items-center text-xs font-semibold text-indigo-700 hover:underline">{t(due ? "开始复习 →" : "查看错题 →")}</Link>
        <Link href="/history#weekly-report" className="inline-flex min-h-11 items-center text-xs font-semibold text-indigo-700 hover:underline">{t("学习周报")}</Link>
      </div>
    </div>
  </section>;
}
