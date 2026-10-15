"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFavorites } from "@/lib/favorites-store";
import { questionCategories } from "@/data/practice-question";
import type { CatalogQuestion, PracticePaper } from "@/data/practice-papers";
import { isCatalogQuestion, isRecord } from "@/data/question-validation";
import StudySession from "@/app/practice/study-session";
import { useStudyHistory } from "@/lib/study-store";

interface Selection { folderId: string; category: string; level: string; questionId?: string; attemptId?: string; fresh?: boolean }

export default function FavoritePracticeClient(initialSelection: Selection) {
  const params = useSearchParams();
  const selection = { ...initialSelection, attemptId: params.get("attempt") ?? undefined };
  const { data, ready, error } = useFavorites();
  const history = useStudyHistory();
  if (!ready || !history.ready) return <p role="status" className="p-8">正在读取收藏……</p>;
  const saved = history.data.attempts.find(a => a.id === selection.attemptId && a.source === "favorites");
  if (selection.attemptId && !saved) return <Feedback message={history.error ?? "找不到这次收藏题练习记录，请从学习记录重新选择。"} />;
  if (error && !saved) return <Feedback message={error} />;
  const ids = saved ? saved.questions.map(q => q.id) : data.entries.filter((entry) => (selection.folderId === "all" || entry.folderIds.includes(selection.folderId)) && (!selection.questionId || entry.questionId === selection.questionId)).map((entry) => entry.questionId);
  const folderName = saved?.periodLabel ?? (selection.folderId === "all" ? "全部收藏夹" : data.folders.find((folder) => folder.id === selection.folderId)?.name ?? "所选收藏夹");
  return <SelectedFavorites key={JSON.stringify(selection)} initialIds={ids} folderName={folderName} {...selection} />;
}

function Feedback({ message, retry }: { message: string; retry?: () => void }) {
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-bold">收藏题练习</h1><p role="status" className="mt-4 leading-7 text-slate-600">{message}</p><div className="mt-5 flex flex-wrap gap-4">{retry && <button type="button" onClick={retry} className="min-h-11 px-3 font-semibold text-indigo-600">重新加载</button>}<Link href="/favorites" className="inline-flex min-h-11 items-center font-semibold text-indigo-600">返回收藏题库</Link></div></section></main>;
}

function SelectedFavorites({ initialIds, folderName, category, level, attemptId }: Selection & { initialIds: readonly string[]; folderName: string }) {
  // Snapshot the selected IDs so editing a favorite never changes a running exercise.
  const [ids] = useState(initialIds);
  const [label] = useState(folderName);
  const [state, setState] = useState<{ paper?: PracticePaper; message?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (ids.length === 0) { setState({ message: "当前选择下没有收藏题目，请先收藏题目或调整筛选。" }); return; }
      try {
        const catalog: CatalogQuestion[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const response = await fetch("/api/practice/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }), signal: controller.signal });
          if (response.status === 401) { setState({ message: "暗号验证已失效，请刷新页面重新输入暗号。" }); return; }
          if (!response.ok) throw new Error("Loading failed");
          const body: unknown = await response.json();
          if (!isRecord(body) || !Array.isArray(body.questions) || !body.questions.every(isCatalogQuestion)) throw new Error("Invalid question data");
          catalog.push(...body.questions);
        }
        const selected = attemptId ? ids.flatMap(id => { const q = catalog.find(item => item.question.id === id); return q ? [q] : []; }) : catalog.filter(({ question }) => (category === "all" || question.category === category) && (level === "all" || question.level === level)).sort((a, b) => questionCategories.indexOf(a.question.category) - questionCategories.indexOf(b.question.category) || a.question.level.localeCompare(b.question.level) || a.year.localeCompare(b.year) || (a.question.sourceQuestionNumber ?? 0) - (b.question.sourceQuestionNumber ?? 0) || a.question.id.localeCompare(b.question.id, undefined, { numeric: true }));
        if (!selected.length) { setState({ message: "当前筛选下没有可作答的收藏题目，请返回调整筛选。" }); return; }
        const questions = selected.map(({ question }) => question);
        const levels = new Set(questions.map((question) => question.level));
        const paper: PracticePaper = { id: "favorites-practice", level: levels.size === 1 ? questions[0].level : "混合", year: "favorites", periodLabel: label, typeLabel: category === "all" ? "收藏题练习" : `${category}收藏练习`, source: "favorites", sourceLabel: "收藏题库", questions, excludedCount: ids.length - catalog.length };
        if (!controller.signal.aborted) setState({ paper });
      } catch { if (!controller.signal.aborted) setState({ message: "收藏题目加载失败，收藏记录未修改，请重试。" }); }
    }
    void load();
    return () => controller.abort();
  }, [ids, label, category, level, retry, attemptId]);
  if (state.paper) return <StudySession paper={state.paper} mode="practice" />;
  return <Feedback message={state.message ?? "正在准备所选收藏题目……"} retry={state.message ? () => { setState({}); setRetry((value) => value + 1); } : undefined} />;
}
