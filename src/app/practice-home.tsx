"use client";

import { useState } from "react";
import Link from "next/link";
import ResponsivePanel from "@/components/responsive-panel";
import type { JLPTLevel } from "@/data/practice-question";
import { questionTypes, type QuestionType } from "@/data/practice-papers";
import { getExamDuration, practiceModes, type PracticeMode } from "@/data/practice-modes";
import { bankSources, formatPeriod, getBankCount, getBankLevels, getBankPeriods, importedBankSummary, type QuestionBankSource } from "@/data/bank-catalog";

const selectClassName = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:border-indigo-500 focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500";

export default function PracticeHome() {
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

  return (
    <main className="flex-1 bg-slate-50 px-4 py-5 font-sans text-slate-900 sm:px-8 sm:py-8">
      <div className="home-layout mx-auto max-w-[1536px]">
        <header className="home-header">
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold tracking-widest text-indigo-600">JLPT Practice</p><Link href="/favorites" className="inline-flex min-h-11 items-center rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">★ 我的收藏</Link></div>
        </header>

        <section aria-labelledby="selection-title" className="home-selection mt-5 rounded-2xl lg:mt-0 border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h2 id="selection-title" className="text-xl font-bold">选择练习</h2>
          <form action="/practice" method="get" className="mt-4">
            <label className="mb-4 block text-sm font-semibold">题库来源
              <select name="source" value={source} onChange={(event) => { const next = bankSources.find((item) => item.value === event.target.value); if (next) setSource(next.value); }} className={selectClassName}>
                {bankSources.map((item) => <option key={item.value} value={item.value} disabled={item.value === "imported" && importedBankSummary.available === 0}>{item.label}</option>)}
              </select>
            </label>
            <fieldset className="mb-4">
              <legend className="mb-3 text-sm font-semibold">作答模式</legend>
              <div className="grid grid-cols-2 gap-2">
                {practiceModes.map((item) => <label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 ${mode === item.value ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                  <input type="radio" name="mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" />
                  <span><span className="block font-semibold">{item.label}</span><span className="mt-1 hidden text-sm leading-6 sm:block text-slate-600">{item.description}</span></span>
                </label>)}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <label className="text-sm font-semibold">
                日语等级
                <select name="level" value={activeLevel} onChange={(event) => { const next = bankLevels.find((level) => level === event.target.value); if (next) setLevel(next); }} className={selectClassName}>
                  {bankLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">
                场次／版本
                <select name="year" value={activePeriod} onChange={(event) => setYear(event.target.value)} aria-describedby="year-note" className={selectClassName}>
                  {periods.map((period) => <option key={period} value={period}>{formatPeriod(period)}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-sm font-semibold sm:col-span-1">
                题目类型
                <select name="type" value={type} onChange={(event) => { const next = questionTypes.find((type) => type.value === event.target.value); if (next) setType(next.value); }} className={selectClassName}>
                  {questionTypes.map((type) => { const count = getBankCount(source, activeLevel, activePeriod, type.value); return <option key={type.value} value={type.value} disabled={count.available === 0}>{type.label} · {count.available} 题{count.excluded > 0 ? `（${count.excluded} 题暂不可用）` : ""}</option>; })}
                </select>
              </label>
            </div>
            <p id="year-note" className="hidden lg:block mt-5 text-sm leading-6 text-slate-500">{source === "imported" ? "按用户资源中的年月场次组织，保留原题号、阅读子题和数字选项；不宣称是原创或已获官方授权。" : "原创版本不代表历年官方真题。"}</p>
            <p aria-live="polite" aria-atomic="true" className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-800">{activeLevel} · {formatPeriod(activePeriod)} · {selection.label} · {questionCount} 题<span className="hidden sm:inline">。{type === "all" ? "包含当前可作答的词汇、语法和阅读，不含听力。" : "仅练习当前题型。"} {counts.excluded > 0 && `另有 ${counts.excluded} 题因缺少媒体或数据不完整暂不可用，未计入本次题量。`} {mode === "exam" ? `考试模式：训练时长 ${getExamDuration(questionCount) / 60} 分钟，交卷后统一解析，非正式考试时长。` : "练习模式：不限时，可开启点击选项即时判定。"}</span></p>
            <button type="submit" disabled={questionCount === 0} className="mt-6 min-h-12 w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto">{mode === "exam" ? "进入考试准备" : type === "all" ? "开始整套练习" : `开始${selection.label}练习`} →</button>
          </form>
        </section>

        <section className="home-intro mt-6" aria-label="学习介绍">
          <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">从一套练习开始，<br className="sm:hidden" />让日语稳步进阶。</h1>
          <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 sm:text-base sm:leading-8 text-slate-600">选择题库、等级、场次与题型。用练习模式掌握知识，或用考试模式检验独立作答能力。</p>
        </section>

        <ResponsivePanel title="练习说明" trigger="题库说明与使用帮助" className="mt-4 lg:mt-0">
        <section aria-label="练习说明" className="grid gap-3">
          {[
            { title: "用户题库与原创题库", text: `已导入 ${importedBankSummary.files} 个文件、${importedBankSummary.available} 道可作答题。原有 N1–N5 的 90 道原创题继续保留。` },
            { title: "资源完整性检查", text: `${importedBankSummary.unavailable} 道题暂缺音频、图片或有效数据，已保留记录但不进入作答和评分。补充资源后可重新导入。` },
            { title: "学习与自测分开", text: "练习模式即时反馈；考试模式限时独立作答，交卷后查看分项成绩与解析。" },
          ].map((item) => (
            <article key={item.title} className="rounded-xl bg-slate-50 p-4">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
            </article>
          ))}
        </section>
        <p id="mobile-year-note" className="mt-4 text-sm leading-7 text-slate-500">{source === "imported" ? "按年月场次组织，保留原题号；内容来自用户提供资源，不宣称官方授权。" : "原创版本不代表历年官方真题。"}练习模式逐题反馈，考试模式交卷后解析。</p>
        <p className="mt-4 text-sm leading-7 text-slate-500">当前只提供可作答资源，未接入音频的听力题不可开始。题量、训练时长及正确率不等同于正式 JLPT 的评分或合格判定。答题记录仅保留在本次页面内，刷新或离开页面后会重置。</p>
        </ResponsivePanel>
      </div>
    </main>
  );
}
