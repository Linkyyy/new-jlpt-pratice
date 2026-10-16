"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFavorites } from "@/lib/favorites-store";
import { questionCategories } from "@/data/practice-question";
import type { CatalogQuestion, PracticePaper } from "@/data/practice-papers";
import { isCatalogQuestion, isRecord } from "@/data/question-validation";
import StudySession from "@/app/practice/study-session";
import { useStudyHistory } from "@/lib/study-store";
import { buildQuestionInsights } from "@/lib/study-insights";
import { useStudyClock } from "@/lib/use-study-clock";
import { collectionEntries, collectionPracticeIds, collectionView, type CollectionView } from "../review-selection";

interface Selection { folderId: string; category: string; level: string; questionId?: string; attemptId?: string; fresh?: boolean; view?: CollectionView }

export default function FavoritePracticeClient(initialSelection: Selection) {
  const params = useSearchParams();
  const selection = { ...initialSelection, view: collectionView(params.get("view") ?? initialSelection.view), attemptId: params.get("attempt") ?? undefined };
  const { data, ready, error } = useFavorites();
  const history = useStudyHistory();
  const now = useStudyClock(history.data);
  if (!ready || !history.ready || !now) return <LoadingSkeleton label="正在读取收藏……" variant="question" fullPage />;
  const saved = history.data.attempts.find(a => a.id === selection.attemptId && a.source === "favorites");
  if (selection.attemptId && !saved) return <Feedback message={history.error ?? "找不到这次收藏题练习记录，请从学习记录重新选择。"} />;
  if (error && !saved) return <Feedback message={error} />;
  if (history.error && selection.view !== "favorites" && !saved) return <Feedback message={history.error} />;
  const entries = collectionEntries(data, buildQuestionInsights(history.data, now), selection.view, now);
  const ids = saved ? saved.questions.map(q => q.id) : collectionPracticeIds(entries, selection.view, selection.folderId, selection.questionId);
  const folderName = saved?.periodLabel ?? (selection.view === "mistakes" ? "错题本" : selection.view === "due" ? "待复习" : selection.folderId === "all" ? "全部收藏夹" : data.folders.find((folder) => folder.id === selection.folderId)?.name ?? "所选收藏夹");
  return <SelectedFavorites key={JSON.stringify(selection)} initialIds={ids} folderName={folderName} savedPaperId={saved?.paperId} savedTypeLabel={saved?.typeLabel} {...selection} />;
}

function Feedback({ message, retry }: { message: string; retry?: () => void }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-slate-50 p-6 text-slate-900"><section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-xl font-bold">{t("收藏题练习")}</h1><p role="status" className="mt-4 leading-7 text-slate-600">{t(message)}</p><div className="mt-5 flex flex-wrap gap-4">{retry && <button type="button" onClick={retry} className="min-h-11 px-3 font-semibold text-indigo-600">{t("重新加载")}</button>}<Link href="/favorites" className="inline-flex min-h-11 items-center font-semibold text-indigo-600">{t("返回收藏题库")}</Link></div></section></main>;
}

function SelectedFavorites({ initialIds, folderName, category, level, attemptId, view = "favorites", savedPaperId, savedTypeLabel }: Selection & { initialIds: readonly string[]; folderName: string; savedPaperId?: string; savedTypeLabel?: string }) {
  // Snapshot the selected IDs so editing a favorite never changes a running exercise.
  const [ids] = useState(initialIds);
  const [label] = useState(folderName);
  const [state, setState] = useState<{ paper?: PracticePaper; message?: string }>({});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (ids.length === 0) { setState({ message: view === "favorites" ? "当前选择下没有收藏题目，请先收藏题目或调整筛选。" : "当前选择下没有可复习的题目，请返回调整筛选。" }); return; }
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
        const selected = attemptId ? ids.flatMap(id => { const q = catalog.find(item => item.question.id === id); return q ? [q] : []; }) : ids.flatMap(id => { const item = catalog.find(item => item.question.id === id); return item && (category === "all" || item.question.category === category) && (level === "all" || item.question.level === level) ? [item] : []; });
        if (!attemptId && view === "favorites") selected.sort((a, b) => questionCategories.indexOf(a.question.category) - questionCategories.indexOf(b.question.category) || a.question.level.localeCompare(b.question.level) || a.year.localeCompare(b.year) || (a.question.sourceQuestionNumber ?? 0) - (b.question.sourceQuestionNumber ?? 0) || a.question.id.localeCompare(b.question.id, undefined, { numeric: true }));
        if (!selected.length) { setState({ message: "当前筛选下没有可作答的收藏题目，请返回调整筛选。" }); return; }
        const questions = selected.map(({ question }) => question);
        const levels = new Set(questions.map((question) => question.level));
        const typeLabel = savedTypeLabel ?? (view === "mistakes" ? "错题练习" : view === "due" ? "间隔复习" : category === "all" ? "收藏题练习" : `${category}收藏练习`);
        const paper: PracticePaper = { id: savedPaperId ?? (view === "favorites" ? "favorites-practice" : `${view}-practice`), level: levels.size === 1 ? questions[0].level : "混合", year: "favorites", periodLabel: label, typeLabel, source: "favorites", sourceLabel: view === "favorites" ? "收藏题库" : "复习题库", questions, excludedCount: ids.length - catalog.length };
        if (!controller.signal.aborted) setState({ paper });
      } catch { if (!controller.signal.aborted) setState({ message: "收藏题目加载失败，收藏记录未修改，请重试。" }); }
    }
    void load();
    return () => controller.abort();
  }, [ids, label, category, level, retry, attemptId, view, savedPaperId, savedTypeLabel]);
  if (state.paper) return <StudySession paper={state.paper} mode="practice" />;
  if (!state.message) return <LoadingSkeleton label="正在准备所选收藏题目……" variant="question" fullPage />;
  return <Feedback message={state.message} retry={() => { setState({}); setRetry((value) => value + 1); }} />;
}
