"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useStudyClock } from "@/lib/use-study-clock";
import { getStudyWeeklyReport } from "@/lib/study-insights";
import type { StudyData } from "@/lib/study-store";

export default function StudyWeeklyReport({ data, ready }: { data: StudyData; ready: boolean }) {
  const { t, locale } = useI18n();
  const now = useStudyClock(data);
  const [period, setPeriod] = useState<"current" | "previous">("current");
  const report = useMemo(() => getStudyWeeklyReport(data, now), [data, now]);
  const metrics = report[period];
  const format = (time: number) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(time);
  const start = period === "current" ? report.weekStart : report.previousWeekStart;
  const end = period === "current" ? now : report.weekStart - 1;
  const weak = metrics.categories.filter(item => item.answered >= 3 && item.accuracy < 80).sort((a, b) => a.accuracy - b.accuracy);
  return <section id="weekly-report" aria-label={t("学习周报")} className="scroll-mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{t("学习周报")}</h2><p className="mt-1 text-xs text-slate-500">{ready && now ? `${format(start)} – ${format(end)} · ${t("日本时间")}` : "—"}{period === "current" && ready && now ? ` · ${t("本周进行中")}` : ""}</p></div><div role="group" aria-label={t("周报时间范围")} className="flex gap-1 rounded-xl bg-slate-50 p-1">{(["current", "previous"] as const).map(value => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${period === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t(value === "current" ? "本周" : "上周")}</button>)}</div></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[
      ["已提交作答", metrics.answered, "题"], ["作答正确率", metrics.accuracy, "%"], ["完成练习 / 考试", metrics.completed, "次"], ["学习天数", metrics.studyDays, "天"],
    ].map(([label, value, unit]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t(label)}</p><p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{ready && now ? value : "—"}<span className="ml-1 text-xs font-normal text-slate-500">{t(unit)}</span></p></div>)}</div>
    {ready && now && (metrics.answered ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{metrics.categories.filter(item => item.answered > 0).map(item => <div key={item.category} className="rounded-xl border border-slate-200 px-3 py-3"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">{t(item.category)}</span><span className="tabular-nums text-slate-500">{item.correct}/{item.answered} · {item.accuracy}%</span></div><progress aria-label={t("{0}正确率", { 0: t(item.category) })} value={item.correct} max={item.answered} className="mt-2 block h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-500" /></div>)}</div>
      <p className="mt-4 text-xs leading-6 text-slate-600">{weak.length ? t("建议优先巩固：{0}。先复习错题，再练同类题。", { 0: weak.map(item => t(item.category)).join(" · ") }) : t("各题型保持练习，定期回顾错题，让记忆更牢固。")}</p>
      <Link href="/favorites?view=mistakes" className="inline-flex min-h-11 items-center text-xs font-semibold text-indigo-600 hover:underline">{t("查看错题 →")}</Link>
    </> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-500">{t("这段时间还没有已提交作答，完成练习后会在这里生成周报。")}</p>)}
    <p className="mt-3 text-xs leading-6 text-slate-400">{t("新作答按提交时间统计，旧记录按完成或最近保存时间估算；未交卷考试不计入周报。")}</p>
  </section>;
}
