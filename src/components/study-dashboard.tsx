"use client";

import Link from "next/link";
import { studyAttemptUrl, studyScore, studySummary, type StudyAttempt, type StudyData } from "@/lib/study-store";

export const studyCard = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";
export function attemptTitle(attempt: StudyAttempt) { return `${attempt.level} · ${attempt.periodLabel} · ${attempt.typeLabel}`; }
export function studyDate(time: number) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time); }
export function AttemptCard({ attempt }: { attempt: StudyAttempt }) {
  const score = studyScore(attempt), completed = attempt.status === "completed";
  const chosen = Object.keys(attempt.answers).length;
  return <article className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
    <div className="min-w-0 flex-1">
      <Link href={`/history/${encodeURIComponent(attempt.id)}`} className="block text-sm font-semibold leading-6 text-slate-900 hover:text-indigo-600">{attemptTitle(attempt)}</Link>
      <p className="mt-1 text-xs leading-5 text-slate-500">{studyDate(attempt.completedAt ?? attempt.updatedAt)} · {attempt.mode === "exam" ? "考试" : "练习"} · {completed ? `答对 ${score.correct}/${score.total} 题` : attempt.status === "ready" ? "待开始" : `已${attempt.mode === "exam" ? "选择" : "提交"} ${attempt.mode === "exam" ? chosen : score.answered}/${score.total} 题`}</p>
    </div>
    <div className="shrink-0 text-right">
      {completed && <p className="text-lg font-bold tabular-nums text-indigo-600">{score.percent}<span className="ml-0.5 text-xs font-normal">分</span></p>}
      <Link href={studyAttemptUrl(attempt)} className="inline-flex min-h-9 items-center text-sm font-semibold text-indigo-600 hover:underline">{completed ? "复习 →" : "继续 →"}</Link>
    </div>
  </article>;
}
export function StudyStats({ data, ready }: { data: StudyData; ready: boolean }) {
  const summary = studySummary(data);
  return <section aria-label="学习概况" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {[
      ["已练题目", summary.unique, "题"], ["完成练习 / 考试", summary.completed, "次"], ["作答正确率", summary.accuracy, "%"], ["连续学习", summary.streak, "天"],
    ].map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs text-slate-500 sm:text-sm">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{ready ? value : "—"}<span className="ml-1.5 text-xs font-normal text-slate-500">{unit}</span></p></div>)}
  </section>;
}
export function StudyAchievements({ data }: { data: StudyData }) {
  const s = studySummary(data);
  const items = [
    { name: "初次落笔", value: s.unique, target: 1, unit: "题" },
    { name: "十题起步", value: s.unique, target: 10, unit: "题" },
    { name: "五十题积累", value: s.unique, target: 50, unit: "题" },
    { name: "百题达成", value: s.unique, target: 100, unit: "题" },
    { name: "首份交卷", value: s.completed, target: 1, unit: "次" },
    { name: "三日坚持", value: s.bestStreak, target: 3, unit: "天" },
  ];
  return <section className={studyCard} aria-labelledby="achievements-title"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="achievements-title" className="font-bold">我的成就</h2><span className="text-xs text-slate-500">已点亮 {items.filter(a => a.value >= a.target).length} / {items.length}</span></div><div className="grid grid-cols-3 gap-2">{items.map(item => {
    const unlocked = item.value >= item.target;
    return <div key={item.name} className={`rounded-xl border px-2 py-3 text-center ${unlocked ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-100 bg-slate-50 text-slate-400"}`}><span aria-hidden="true" className="text-xl">{unlocked ? "✦" : "◇"}</span><p className="mt-1 text-xs font-semibold">{item.name}</p><p className="mt-1 text-[11px]">{unlocked ? "已达成" : `${Math.min(item.value, item.target)}/${item.target} ${item.unit}`}</p></div>;
  })}</div></section>;
}
