"use client";

import { useRouter } from "next/navigation";
import PracticeStartButton from "@/components/practice-start-button";
import LoadingSkeleton from "@/components/loading-skeleton";
import DisplaySettings from "@/components/display-settings";
import ActionLabel, { actionButtonClass } from "@/components/action-label";
import { useI18n } from "@/lib/i18n";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { AttemptCard, attemptTitle, studyCard } from "@/components/study-dashboard";
import { latestStudyAttempt, questionTrails, studyAttemptUrl, studyScore, useStudyHistory } from "@/lib/study-store";
import type { JLPTLevel } from "@/data/practice-question";
import { questionTypes, type QuestionType } from "@/data/practice-papers";
import { getExamDuration, practiceModes, type PracticeMode } from "@/data/practice-modes";
import { bankSources, formatPeriod, getBankCount, getBankLevels, getBankPeriods, importedBankSummary, type QuestionBankSource } from "@/data/bank-catalog";

const selectClassName = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:border-indigo-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500";

export default function PracticeHome() {
  const { t } = useI18n();
  const router = useRouter();
  const [starting, startNavigation] = useTransition();
  const [source, setSource] = useState<QuestionBankSource>(importedBankSummary.available > 0 ? "imported" : "original");
  const [level, setLevel] = useState<JLPTLevel>("N2");
  const [year, setYear] = useState<string>(getBankPeriods(source, "N2")[0] ?? "2026");
  const [type, setType] = useState<QuestionType>("all");
  const [mode, setMode] = useState<PracticeMode>("practice");
  const selection = questionTypes.find((item) => item.value === type) ?? questionTypes[0];
  const bankLevels = getBankLevels(source);
  const activeLevel = bankLevels.includes(level) ? level : bankLevels[0] ?? "N2";
  const periods = getBankPeriods(source, activeLevel);
  const activePeriod = periods.includes(year) ? year : periods[0] ?? "2026";
  const counts = getBankCount(source, activeLevel, activePeriod, type);
  const questionCount = counts.available;
  const { data, ready, error } = useStudyHistory();
  const trails = useMemo(() => questionTrails(data), [data]);
  const paperId = `${source === "imported" ? "imported-" : ""}${activeLevel}-${activePeriod}-${type}`;
  const active = latestStudyAttempt(data, paperId, mode);
  const latest = latestStudyAttempt(data);
  const recent = [...data.attempts].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const completed = data.attempts.filter(a => a.paperId === paperId && a.mode === mode && a.status === "completed");
  const done = [...trails].filter(([id, q]) => {
    const samePaper = source === "imported" ? id.startsWith(`imported:${activePeriod}:${activeLevel}:`) : id.startsWith(`${activeLevel}-${activePeriod}-`);
    return samePaper && (selection.category === null ? q.category !== "听力" : q.category === selection.category);
  }).length;
  const newUrl = `/practice?${new URLSearchParams({ source, level: activeLevel, year: activePeriod, type, mode, fresh: "1" })}`;

  function beginPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (starting || !ready || questionCount === 0) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) params.set(key, String(value));
    startNavigation(() => router.push(`/practice?${params}`));
  }

  return (
    <main className="flex-1 bg-slate-50 px-4 py-5 font-sans text-slate-900 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 pb-1">
          <p className="text-sm font-bold tracking-widest text-indigo-600">JLPT Practice</p>
          <nav aria-label={t("个人学习")} className="flex items-center gap-2"><Link href="/history" aria-label={t("学习记录")} title={t("学习记录")} className={actionButtonClass}><ActionLabel icon="history">{t("学习记录")}</ActionLabel></Link><Link href="/favorites" aria-label={t("我的收藏")} title={t("我的收藏")} className={actionButtonClass}><ActionLabel icon="favorites">{t("我的收藏")}</ActionLabel></Link><DisplaySettings /></nav>
        </header>
        {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{t(error)}</p>}
        {latest && <section aria-label={t("继续上次学习")} className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:px-6"><div className="min-w-0"><p className="text-xs font-semibold text-indigo-600">{t("接着上次练习")}</p><p className="mt-1 text-sm font-semibold leading-6 text-slate-800">{attemptTitle(latest, t)}</p></div><Link href={studyAttemptUrl(latest)} className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">{t("继续 →")}</Link></section>}
        <div className="grid items-start gap-5 lg:grid-cols-[1.05fr_1fr]">
        <section aria-labelledby="selection-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 id="selection-title" className="text-xl font-bold">{t("选择练习")}</h2>
          <form action="/practice" method="get" onSubmit={beginPractice} className="mt-4">
            <label className="mb-4 block text-sm font-semibold">{t("题库来源")}<select name="source" value={source} onChange={(event) => { const next = bankSources.find((item) => item.value === event.target.value); if (next) setSource(next.value); }} className={selectClassName}>
                {bankSources.map((item) => <option key={item.value} value={item.value} disabled={item.value === "imported" && importedBankSummary.available === 0}>{t(item.label)}</option>)}
              </select>
            </label>
            <fieldset className="mb-4">
              <legend className="mb-3 text-sm font-semibold">{t("作答模式")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {practiceModes.map((item) => <label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 ${mode === item.value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                  <input type="radio" name="mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" />
                  <span><span className="block font-semibold">{t(item.label)}</span><span className="mt-1 hidden text-sm leading-6 sm:block text-slate-600">{t(item.description)}</span></span>
                </label>)}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <label className="text-sm font-semibold">
                {t("日语等级")}<select name="level" value={activeLevel} onChange={(event) => { const next = bankLevels.find((level) => level === event.target.value); if (next) setLevel(next); }} className={selectClassName}>
                  {bankLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">
                {t("场次／版本")}<select name="year" value={activePeriod} onChange={(event) => setYear(event.target.value)} className={selectClassName}>
                  {periods.map((period) => <option key={period} value={period}>{t(formatPeriod(period))}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm font-semibold sm:col-span-1">
                {t("题目类型")}<select name="type" value={type} onChange={(event) => { const next = questionTypes.find((type) => type.value === event.target.value); if (next) setType(next.value); }} className={selectClassName}>
                  {questionTypes.map((type) => { const count = getBankCount(source, activeLevel, activePeriod, type.value); return <option key={type.value} value={type.value} disabled={count.available === 0}>{t(type.label)} · {count.available} {t("题")}{t(count.excluded > 0 ? `（${count.excluded} 题暂不可用）` : "")}</option>; })}
                </select>
              </label>
            </div>
            <div aria-live="polite" aria-atomic="true" className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 text-sm"><p className="font-semibold text-slate-700">{t("本卷足迹")}</p><p className="tabular-nums text-indigo-600">{t("已练")}{ready ? Math.min(done, questionCount) : "—"} / {questionCount} {t("题")}</p></div>
              <progress aria-label={t("本卷已练题目")} value={Math.min(done, questionCount)} max={questionCount || 1} className="mt-3 block h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-indigo-500 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-500" />
              <p className="mt-3 text-xs leading-5 text-slate-500">{t(completed.length ? `已完成 ${completed.length} 次 · 最佳 ${Math.max(...completed.map(a => studyScore(a).percent))} 分` : "完成作答后点亮足迹，同一道题重复练习只计入一次。")}{t(mode === "exam" ? ` · 训练 ${getExamDuration(questionCount) / 60} 分钟` : "")}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <PracticeStartButton pending={starting} disabled={!ready || questionCount === 0} label={active ? mode === "exam" ? "继续考试" : "继续练习" : mode === "exam" ? "进入考试准备" : "开始练习"} />
              {active && <Link href={newUrl} className="inline-flex min-h-12 items-center text-sm font-semibold text-slate-500 hover:text-indigo-600">{t("重新开始")}</Link>}
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <section className={studyCard} aria-labelledby="recent-title"><div className="mb-4 flex items-center justify-between"><h2 id="recent-title" className="font-bold">{t("最近作答")}</h2><Link href="/history" className="text-xs font-semibold text-indigo-600">{t("全部记录 →")}</Link></div>{!ready ? <LoadingSkeleton label="正在读取学习记录……" /> : recent.length ? <div className="space-y-2">{recent.map(a => <AttemptCard key={a.id} attempt={a} />)}</div> : <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"><p className="text-sm text-slate-500">{t("从第一道题开始，积累你的学习足迹。")}</p><p className="mt-2 text-xs text-slate-400">{t("进度与每次交卷成绩自动保存")}</p></div>}</section>
        </aside>
        </div>
        <details className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><summary className="cursor-pointer font-semibold text-slate-700">{t("题库说明与记录帮助")}</summary><div className="mt-3 space-y-2 text-xs leading-6"><p>{t("进度、历史成绩与做题足迹保存在当前浏览器，可在学习记录中导出备份。无痕模式或清理浏览器数据后无法保留。学习天数按日本时间计算。")}</p><p>{t("题号右上角的小圆点表示曾练习；当前作答仍用颜色显示正误。整篇阅读与长文语法题统一提交后才留下足迹。")}</p><p>{t("用户题库已导入")}{importedBankSummary.files} {t("个文件、")}{importedBankSummary.available} {t("道可作答题；资源不完整的")}{importedBankSummary.unavailable} {t("道题暂不参与作答。原创题库不代表官方真题。题量、时长及成绩不等同于正式 JLPT 评分。")}</p></div></details>
      </div>
    </main>
  );
}
