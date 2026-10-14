"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FavoriteButton from "@/components/favorite-button";
import FolderManager from "@/components/folder-manager";
import { levels, questionCategories, type JLPTLevel, type QuestionCategory } from "@/data/practice-question";
import { questionTypes, type CatalogQuestion } from "@/data/practice-papers";
import { useFavorites } from "@/lib/favorites-store";
import { formatPeriod } from "@/data/bank-catalog";
import { isCatalogQuestion, isRecord } from "@/data/question-validation";
import RichContent from "@/components/rich-content";
import QuestionBody from "@/components/question-body";

const selectClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600";

export default function FavoritesClient({ catalog }: { catalog: readonly CatalogQuestion[] }) {
  const { data, ready, error } = useFavorites();
  const [folderId, setFolderId] = useState("all");
  const [category, setCategory] = useState<QuestionCategory | "all">("all");
  const [level, setLevel] = useState<JLPTLevel | "all">("all");
  const [remote, setRemote] = useState<{ key: string; items: readonly CatalogQuestion[]; error: string | null }>({ key: "", items: [], error: null });
  const [retry, setRetry] = useState(0);
  const importedIdsKey = data.entries.filter((entry) => entry.questionId.startsWith("imported:")).map((entry) => entry.questionId).sort().join("|");
  const loadingImported = importedIdsKey.length > 0 && remote.key !== importedIdsKey;
  useEffect(() => {
    if (!importedIdsKey) return;
    const controller = new AbortController();
    async function load() {
      try {
        const ids = importedIdsKey.split("|");
        const items: CatalogQuestion[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const response = await fetch("/api/favorites/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }), signal: controller.signal });
          if (!response.ok) throw new Error("Failed to load questions");
          const body: unknown = await response.json();
          if (!isRecord(body) || !Array.isArray(body.questions)) throw new Error("Invalid response");
          const questions: unknown[] = body.questions;
          if (!questions.every(isCatalogQuestion)) throw new Error("Invalid question format");
          items.push(...questions);
        }
        if (!controller.signal.aborted) setRemote({ key: importedIdsKey, items, error: null });
      } catch {
        if (!controller.signal.aborted) setRemote({ key: importedIdsKey, items: [], error: "收藏题目加载失败，收藏记录未被修改。" });
      }
    }
    void load();
    return () => controller.abort();
  }, [importedIdsKey, retry]);
  const activeFolder = folderId === "all" || data.folders.some((folder) => folder.id === folderId) ? folderId : "all";
  const catalogById = new Map([...catalog, ...(remote.key === importedIdsKey ? remote.items : [])].map((item) => [item.question.id, item]));
  const folderEntries = data.entries.filter((entry) => activeFolder === "all" || entry.folderId === activeFolder);
  const levelEntries = folderEntries.filter((entry) => level === "all" || catalogById.get(entry.questionId)?.question.level === level);
  const filtered = levelEntries.filter((entry) => {
    const item = catalogById.get(entry.questionId);
    return category === "all" || item?.question.category === category;
  }).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  return (
    <main aria-busy={loadingImported} className="min-h-screen bg-slate-50 px-4 py-8 font-sans text-slate-900 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header>
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:underline">← 首页 / 选择练习</Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-bold">我的收藏</h1>
            <FolderManager />
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-600">按收藏夹、题型和等级整理题目。每道题归入一个收藏夹，可从题目上的“已收藏”按钮移动或取消收藏。</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">收藏仅保存在当前浏览器，刷新后仍保留；不会跨设备同步，清除网站数据会删除收藏。</p>
        </header>
        {!ready ? <p role="status" className="mt-8">正在读取本地收藏……</p> : error ? <p role="alert" className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-700">{error}</p> : <>
          <section aria-label="筛选收藏" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">收藏夹
                <select aria-label="筛选收藏夹" value={activeFolder} onChange={(event) => setFolderId(event.target.value)} className={selectClass}>
                  <option value="all">全部收藏夹 · {data.entries.length} 题</option>
                  {data.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name} · {data.entries.filter((entry) => entry.folderId === folder.id).length} 题</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">等级
                <select aria-label="筛选等级" value={level} onChange={(event) => { const selected = levels.find((item) => item === event.target.value); setLevel(selected ?? "all"); }} className={selectClass}>
                  <option value="all">全部等级</option>
                  {levels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
            </div>
            <div aria-label="按题型筛选" className="mt-5 flex flex-wrap gap-2">
              {(["all", ...questionCategories] as const).map((type) => {
                const count = levelEntries.filter((entry) => type === "all" || catalogById.get(entry.questionId)?.question.category === type).length;
                return <button key={type} type="button" onClick={() => setCategory(type)} aria-pressed={category === type} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${category === type ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{type === "all" ? "全部题型" : type} · {count}</button>;
              })}
            </div>
          </section>
          {loadingImported && <p role="status" className="mt-4 text-sm text-slate-500">正在读取用户题库中的收藏题目……</p>}
          {remote.key === importedIdsKey && remote.error && <p role="alert" className="mt-4 text-sm text-rose-700">{remote.error}<button type="button" onClick={() => { setRemote({ key: "", items: [], error: null }); setRetry((value) => value + 1); }} className="ml-2 min-h-11 px-3 underline">重试</button></p>}
          <p role="status" className="mt-5 text-sm text-slate-600">显示 {filtered.length} / {data.entries.length} 道收藏题目</p>
          {filtered.length === 0 ? <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <h2 className="font-bold">{data.entries.length === 0 ? "还没有收藏题目" : "当前筛选下没有收藏题目"}</h2>
            <p className="mt-3 text-sm leading-7 text-slate-500">{data.entries.length === 0 ? "在练习题或考试题上点击“收藏本题”，选择收藏夹即可。" : "试试其他收藏夹、题型或等级。"}</p>
            {data.entries.length === 0 ? <Link href="/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-indigo-600 underline">去选择练习</Link> : <button type="button" onClick={() => { setFolderId("all"); setCategory("all"); setLevel("all"); }} className="mt-4 min-h-11 px-4 font-semibold text-indigo-600 underline">清除筛选</button>}
          </section> : <div className="mt-4 space-y-5">
            {filtered.map((entry) => {
              const item = catalogById.get(entry.questionId);
              const folderName = data.folders.find((folder) => folder.id === entry.folderId)?.name;
              if (!item) return <article key={entry.questionId} className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">{loadingImported && entry.questionId.startsWith("imported:") ? "正在读取收藏题目" : "收藏的题目暂不可用"}</h2><p className="mt-2 text-sm leading-6 break-words text-slate-500">题目 ID：{entry.questionId}。收藏记录已保留。</p><FavoriteButton questionId={entry.questionId} /></article>;
              const { question, year } = item;
              const type = questionTypes.find((type) => type.category === question.category)?.value ?? "all";
              const practiceLink = `/practice?source=${item.source ?? "original"}&level=${question.level}&year=${year}&type=${type}&mode=practice&question=${encodeURIComponent(question.id)}`;
              return <article key={question.id} data-question-id={question.id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-sm font-semibold leading-6 break-words text-slate-600">{question.level} · {formatPeriod(year)} · {item.source === "imported" ? "用户提供题库" : "原创模拟题库"} · {question.category} · {folderName}</h2>
                <QuestionBody question={question} />
                <ol lang="ja" className="mt-4 grid gap-2 text-sm leading-7 sm:grid-cols-2">{question.options.map((option) => <li key={option.id} className="rounded-lg border border-slate-200 px-3 py-2"><span className="font-semibold">{option.label ?? option.id}. </span><RichContent text={option.text} html={question.richText} /></li>)}</ol>
                <div className="flex flex-wrap items-center gap-x-4"><FavoriteButton questionId={question.id} /><Link href={practiceLink} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 underline">练习本题 →</Link></div>
                <details className="mt-4 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-indigo-700">查看答案与解析</summary><p className="mt-3 text-sm font-semibold">正确答案：{question.options.find((option) => option.id === question.correctOptionId)?.label ?? question.correctOptionId}</p>{question.explanation.map((paragraph, index) => <RichContent key={index} text={paragraph} html={question.richText} className="mt-2 text-sm leading-7 text-slate-700" />)}</details>
              </article>;
            })}
          </div>}
        </>}
      </div>
    </main>
  );
}
