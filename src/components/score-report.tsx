"use client";

import { useI18n } from "@/lib/i18n";
import type { PracticeScoreResult } from "@/lib/practice-scoring";

function encouragement(result: PracticeScoreResult) {
  if (result.missingSections) return { icon: "📘", title: "补齐练习，再向完整成绩出发", text: "已有的练习都算数，继续完成未覆盖的计分项。" };
  const ratio = result.maxScore ? result.score / result.maxScore : 0;
  if (ratio >= 1) return { icon: "🏆", title: "满分达成，继续保持！", text: "这一轮掌握得很扎实，试试下一套题巩固实力。" };
  if (ratio >= .8) return { icon: "🌟", title: "表现很棒，离满分又近一步！", text: "把剩下的错题收进收藏夹，下一轮更有把握。" };
  if (ratio >= .6) return { icon: "✨", title: "稳步进步，再向前一步！", text: "找到薄弱项，集中练一练，你会更稳。" };
  if (ratio >= .4) return { icon: "💪", title: "基础正在扎根，继续加油！", text: "先回顾错题，再练一次，把不确定变成会做。" };
  return { icon: "🌱", title: "下一轮，从一道题开始", text: "先做会的题，再逐步攻克错题，每一次练习都有收获。" };
}

export default function ScoreReport({ result }: { result: PracticeScoreResult }) {
  const { t } = useI18n();
  const message = encouragement(result);
  return <section aria-label={t("成绩报告")} className="mt-6 space-y-4">
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 sm:p-7">
      <p className="text-xs font-semibold tracking-wide text-indigo-700">{t("练习估分")}{result.sections.length === 1 && ` · ${t(result.sections[0].label)}`}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p aria-label={t("得分 {0}/{1}", { 0: result.score, 1: result.maxScore })} className="flex min-w-0 items-baseline gap-2 whitespace-nowrap font-bold tabular-nums tracking-tight text-indigo-700"><span className="text-5xl min-[380px]:text-6xl sm:text-7xl">{result.score}</span><span className="text-2xl font-semibold sm:text-3xl">/ {result.maxScore}</span></p>
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 min-[380px]:h-16 min-[380px]:w-16 items-center justify-center rounded-2xl bg-white text-3xl min-[380px]:text-4xl sm:h-20 sm:w-20 sm:text-5xl">{message.icon}</span>
      </div>
      <h2 className="mt-4 text-lg font-bold leading-7 text-slate-900">{t(message.title)}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{t(message.text)}</p>
    </div>
    {result.sections.length > 1 && <div role="group" aria-label={t("分项估分")} className={`grid gap-3 ${result.sections.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {result.sections.map(section => <div key={section.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold leading-5 text-slate-600">{t(section.label)}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{section.available ? section.score : "—"}<span className="ml-1 text-sm font-normal text-slate-500">/ {section.maxScore}</span></p>
        {section.available ? <><progress aria-label={t(section.label)} value={section.score} max={section.maxScore} className="mt-3 block h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-500" /><p className="mt-2 text-xs text-slate-500">{t("答对 {0}/{1} 题", { 0: section.correct, 1: section.total })}</p></> : <p className="mt-2 text-xs text-amber-800">{t("本卷未覆盖")}</p>}
      </div>)}
    </div>}
    {result.missingSections && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">{t("本卷缺少部分题型，未覆盖部分不补分；整卷仍按 180 分计，完成全部题型后再比较成绩。")}</p>}
    <p className="text-xs leading-6 text-slate-500">{t("本站将词汇、语法各按 30 分估算，阅读、听力各 60 分，按各题型答对比例计算，未作答不计分。JLPT 官方采用量尺评分，此处为练习估分，不代表官方成绩或合格判定。")}</p>
  </section>;
}
