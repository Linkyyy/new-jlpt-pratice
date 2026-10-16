"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FloatingSettings from "@/components/floating-settings";
import BackupControls from "@/components/backup-controls";
import FontSizeSetting from "@/app/practice/font-size-setting";
import FavoriteQuestion, { favoriteTitle } from "./favorite-question";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import FolderManager from "@/components/folder-manager";
import { levels, questionCategories, type JLPTLevel, type QuestionCategory } from "@/data/practice-question";
import { type CatalogQuestion } from "@/data/practice-papers";
import { useFavorites } from "@/lib/favorites-store";
import { isCatalogQuestion, isRecord } from "@/data/question-validation";
import { useStudyHistory } from "@/lib/study-store";
import { buildQuestionInsights } from "@/lib/study-insights";
import { useStudyClock } from "@/lib/use-study-clock";
import { collectionEntries, collectionView, type CollectionView } from "./review-selection";

type FavoriteViewMode = "preview" | "cards";

const selectClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600";

function subscribeDesktop(listener: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export default function FavoritesClient({ catalog }: { catalog: readonly CatalogQuestion[] }) {
  const { t } = useI18n();
  const { data, ready, error } = useFavorites();
  const history = useStudyHistory();
  const params = useSearchParams();
  const view = collectionView(params.get("view"));
  const now = useStudyClock(history.data);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia("(min-width: 1024px)").matches, () => false);
  const [mode, setMode] = useState<FavoriteViewMode>("preview");
  const viewMode = desktop ? "preview" : mode;
  const [sortSelection, setSortSelection] = useState<{ view: CollectionView; value: string }>({ view: "favorites", value: "recent" });
  const sort = sortSelection.view === view ? sortSelection.value : view === "due" ? "due" : view === "mistakes" ? "wrong" : "recent";
  function setSort(value: string) { setSortSelection({ view, value }); }
  const [fontSize, setFontSize] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const [folderId, setFolderId] = useState("all");
  const [category, setCategory] = useState<QuestionCategory | "all">("all");
  const [level, setLevel] = useState<JLPTLevel | "all">("all");
  const [remote, setRemote] = useState<{ key: string; items: readonly CatalogQuestion[]; error: string | null }>({ key: "", items: [], error: null });
  const questionCache = useRef(new Map<string, CatalogQuestion>());
  const [retry, setRetry] = useState(0);
  const insights = buildQuestionInsights(history.data, now);
  const entries = collectionEntries(data, insights, view, now);
  const importedIdsKey = entries.filter((entry) => entry.questionId.startsWith("imported:")).map((entry) => entry.questionId).sort().join("|");
  const loadingImported = importedIdsKey.length > 0 && remote.key !== importedIdsKey;
  useEffect(() => {
    if (!importedIdsKey) return;
    const controller = new AbortController();
    async function load() {
      try {
        const ids = importedIdsKey.split("|");
        const items = ids.flatMap(id => { const item = questionCache.current.get(id); return item ? [item] : []; });
        const missing = ids.filter(id => !questionCache.current.has(id));
        for (let offset = 0; offset < missing.length; offset += 100) {
          const response = await fetch("/api/favorites/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: missing.slice(offset, offset + 100) }), signal: controller.signal });
          if (!response.ok) throw new Error("Failed to load questions");
          const body: unknown = await response.json();
          if (!isRecord(body) || !Array.isArray(body.questions)) throw new Error("Invalid response");
          const questions: unknown[] = body.questions;
          if (!questions.every(isCatalogQuestion)) throw new Error("Invalid question format");
          items.push(...questions);
          questions.forEach(item => questionCache.current.set(item.question.id, item));
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
  const folderEntries = entries.filter((entry) => view !== "favorites" || activeFolder === "all" || entry.folderIds.includes(activeFolder));
  const levelEntries = folderEntries.filter((entry) => level === "all" || catalogById.get(entry.questionId)?.question.level === level);
  const filtered = levelEntries.filter((entry) => {
    const item = catalogById.get(entry.questionId);
    return category === "all" || item?.question.category === category;
  }).sort((a, b) => {
    if (sort === "wrong") return (insights.get(b.questionId)?.wrongCount ?? 0) - (insights.get(a.questionId)?.wrongCount ?? 0) || (insights.get(b.questionId)?.lastAnsweredAt ?? 0) - (insights.get(a.questionId)?.lastAnsweredAt ?? 0) || a.questionId.localeCompare(b.questionId);
    if (sort === "due") return (insights.get(a.questionId)?.dueAt ?? Infinity) - (insights.get(b.questionId)?.dueAt ?? Infinity) || a.questionId.localeCompare(b.questionId);
    if (sort === "recent" && view !== "favorites") return (insights.get(b.questionId)?.lastAnsweredAt ?? 0) - (insights.get(a.questionId)?.lastAnsweredAt ?? 0) || a.questionId.localeCompare(b.questionId);
    if (sort === "paper") {
      const left = catalogById.get(a.questionId), right = catalogById.get(b.questionId);
      return (right?.year ?? "").localeCompare(left?.year ?? "") || (left?.question.level ?? "").localeCompare(right?.question.level ?? "") || questionCategories.indexOf(left?.question.category ?? "词汇") - questionCategories.indexOf(right?.question.category ?? "词汇") || (left?.question.sourceQuestionNumber ?? 0) - (right?.question.sourceQuestionNumber ?? 0) || a.questionId.localeCompare(b.questionId, undefined, { numeric: true });
    }
    return b.savedAt.localeCompare(a.savedAt) || a.questionId.localeCompare(b.questionId);
  });

  const practiceQuery = new URLSearchParams({ view, folder: view === "favorites" ? activeFolder : "all", category, level, ...(view !== "favorites" ? { fresh: "1" } : {}) });
  const practiceLabel = view === "mistakes" ? "练习当前错题" : view === "due" ? "开始到期复习" : "练习当前收藏";
  const sortLabel = sort === "wrong" ? "错误次数最多" : sort === "due" ? "复习时间最早" : sort === "paper" ? "场次、等级与题号" : view === "favorites" ? "最近收藏" : "最近作答时间";
  const selectedFolder = data.folders.find(folder => folder.id === activeFolder);
  const filterSummary = [view === "favorites" && selectedFolder ? selectedFolder.id === "default" ? t("默认收藏夹") : selectedFolder.name : t("全部"), level === "all" ? null : level, category === "all" ? null : t(category)].filter(Boolean).join(" · ");
  const emptyTitle = view === "mistakes" ? "当前没有错题" : view === "due" ? "当前没有到期复习题目" : data.entries.length === 0 ? "还没有收藏题目" : "当前筛选下没有收藏题目";

  const activeId = filtered.some(entry => entry.questionId === selectedId) ? selectedId : filtered[0]?.questionId ?? null;
  const currentIndex = filtered.findIndex(entry => entry.questionId === activeId);
  const detailEntries = viewMode === "cards" ? filtered : filtered.filter(entry => entry.questionId === activeId);
  function selectQuestion(id: string) {
    setSelectedId(id); setMobileDetail(true);
    requestAnimationFrame(() => {
      const pane = paneRef.current;
      const article = [...(pane?.querySelectorAll<HTMLElement>("[data-question-id]") ?? [])].find(el => el.dataset.questionId === id);
      if (desktop) pane?.scrollTo({ top: viewMode === "cards" ? article?.offsetTop ?? 0 : 0 });
      else pane?.scrollIntoView({ block: "start" });
      article?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  }
  function returnToList() { setMobileDetail(false); if (mode === "cards") setMode("preview"); }
  function resetSelection() { setMobileDetail(false); setSelectedId(null); listRef.current?.scrollTo({ top: 0 }); paneRef.current?.scrollTo({ top: 0 }); }
  function changeView(next: CollectionView) {
    setSortSelection({ view: next, value: next === "favorites" ? "recent" : next === "due" ? "due" : "wrong" }); resetSelection();
    const url = new URL(window.location.href);
    if (next === "favorites") url.searchParams.delete("view"); else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <main aria-busy={loadingImported} className="favorites-page min-h-screen bg-slate-50 px-4 py-4 font-sans text-slate-900 sm:px-8 sm:py-6">
      <div className="favorites-shell" style={{ "--practice-font-size": `${fontSize}px` } as CSSProperties}>
        <header className="favorites-header">
          <div><Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:underline">{t("← 首页")}</Link><h1 className="text-2xl font-bold">{t("收藏与错题")}<span className="ml-2 text-sm font-normal text-slate-500">{entries.length} {t("题")}</span></h1></div>
          <div className="flex flex-wrap items-center gap-3"><BackupControls /></div>
        </header>
        {!ready || !history.ready || !now ? <LoadingSkeleton label="正在读取本地收藏……" /> : error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-700">{t(error)}</p> : <>
          <nav aria-label={t("收藏与复习分类")} className="collection-tabs">
            {([["favorites", "我的收藏", data.entries.length], ["mistakes", "错题本", [...insights.values()].filter(item => item.wrongCount > 0).length], ["due", "待复习", [...insights.values()].filter(item => item.wrongCount > 0 && item.dueAt <= now).length]] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={view === value} onClick={() => changeView(value)} className={view === value ? "collection-tab-current" : ""}>{t(label)}<span className="ml-2 text-xs tabular-nums">{count}</span></button>)}
          </nav>
          {history.error && <p role="alert" className="text-sm text-rose-700">{t(history.error)}</p>}
          <section aria-label={t("收藏工具栏")} className="collection-toolbar">
            <FloatingSettings title={t("筛选与排序")} triggerClassName="collection-filter-trigger" trigger={<><span className="min-w-0 truncate">{filterSummary} · {t(sortLabel)}</span><svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="currentColor" className="shrink-0"><path d="m5 7 5 6 5-6Z" /></svg></>}>
              <div className="collection-filter-fields">
                {view === "favorites" && <label className="text-xs font-semibold text-slate-500">{t("收藏夹")}<select aria-label={t("筛选收藏夹")} value={activeFolder} onChange={event => { setFolderId(event.target.value); resetSelection(); }} className={selectClass}><option value="all">{t("全部收藏夹 ·")}{data.entries.length} {t("题")}</option>{data.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.id === "default" ? t("默认收藏夹") : folder.name} · {data.entries.filter(entry => entry.folderIds.includes(folder.id)).length} {t("题")}</option>)}</select></label>}
                <label className="text-xs font-semibold text-slate-500">{t("等级")}<select aria-label={t("筛选等级")} value={level} onChange={event => { setLevel(levels.find(item => item === event.target.value) ?? "all"); resetSelection(); }} className={selectClass}><option value="all">{t("全部等级")}</option>{levels.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-500">{t("题型")}<select aria-label={t("筛选题型")} value={category} onChange={event => { setCategory(questionCategories.find(item => item === event.target.value) ?? "all"); resetSelection(); }} className={selectClass}><option value="all">{t("全部题型")}</option>{questionCategories.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-500">{t("排序")}<select aria-label={t("复习排序")} value={sort} onChange={event => { setSort(event.target.value); resetSelection(); }} className={selectClass}><option value="recent">{t(view === "favorites" ? "最近收藏" : "最近作答时间")}</option><option value="wrong">{t("错误次数最多")}</option><option value="due">{t("复习时间最早")}</option><option value="paper">{t("场次、等级与题号")}</option></select></label>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4"><p role="status" className="text-xs text-slate-500">{filtered.length} {t("题")}</p><div className="flex items-center gap-3"><button type="button" onClick={() => { setFolderId("all"); setCategory("all"); setLevel("all"); resetSelection(); }} className="min-h-11 text-sm font-semibold text-slate-500 hover:text-indigo-600">{t("清除筛选")}</button><button type="button" onClick={event => event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()} className="min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">{t("完成")}</button></div></div>
            </FloatingSettings>
            <div className="collection-toolbar-actions">{filtered.some(entry => catalogById.has(entry.questionId)) && !loadingImported && <Link href={`/favorites/practice?${practiceQuery}`} aria-label={t(practiceLabel)} title={t(practiceLabel)} className="settings-toggle"><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="text-indigo-600"><path d="m9 5 11 7-11 7Z" /></svg></Link>}
              <FloatingSettings title={t("收藏设置")} icon={<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>}>
                {!desktop && <fieldset className="lg:hidden"><legend className="text-sm font-semibold">{t("查看模式")}</legend><div className="mt-2 grid gap-2">{([
                  ["preview", "摘要列表", "先看场次与题号，选中后查看题目"], ["cards", "完整卡片", "连续浏览完整题目，答案折叠显示"],
                ] as const).map(([value, label, description]) => <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3"><input type="radio" name="favorite-view" value={value} checked={mode === value} onChange={() => { setMode(value); resetSelection(); paneRef.current?.scrollTo({ top: 0 }); }} className="mt-1 accent-indigo-600" /><span className="text-sm"><span className="block font-semibold">{t(label)}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{t(description)}</span></span></label>)}</div></fieldset>}

                <div className="mt-3"><FontSizeSetting value={fontSize} onChange={setFontSize} /></div>
                <div className="mt-4 border-t border-slate-200 pt-4"><FolderManager /></div>
                <p className="mt-4 text-xs leading-6 text-slate-500">{t("备份包含全部收藏夹、收藏题目与做题记录，不受当前筛选影响。")}</p>
              </FloatingSettings>
            </div>
          </section>
          {loadingImported && <LoadingSkeleton label="正在读取用户题库中的收藏题目……" />}
          {remote.key === importedIdsKey && remote.error && <p role="alert" className="text-sm text-rose-700">{t(remote.error)}<button type="button" onClick={() => { setRemote({ key: "", items: [], error: null }); setRetry(value => value + 1); }} className="ml-2 min-h-11 px-3 underline">{t("重试")}</button></p>}
          {filtered.length === 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center"><h2 className="font-bold">{t(emptyTitle)}</h2><p className="mt-3 text-sm leading-7 text-slate-500">{t(view === "mistakes" ? "已提交的错题会自动保留在这里，无需收藏。" : view === "due" ? "完成练习后，会根据作答表现安排下一次复习。也可以调整题型和等级筛选。" : data.entries.length === 0 ? "在题目上点击星标，选择收藏夹即可。" : "试试其他收藏夹、题型或等级。")}</p><div className="mt-4 flex justify-center gap-4"><Link href="/" className="inline-flex min-h-11 items-center font-semibold text-indigo-600">{t("去选择练习 →")}</Link>{(category !== "all" || level !== "all" || view === "favorites" && activeFolder !== "all") && <button type="button" onClick={() => { setFolderId("all"); setCategory("all"); setLevel("all"); resetSelection(); }} className="min-h-11 px-4 font-semibold text-indigo-600">{t("清除筛选")}</button>}</div></section> : <div className="favorites-browser" data-mobile-detail={mobileDetail} data-view-mode={viewMode}>
            <nav ref={listRef} aria-label={t("收藏题目一览")} className="favorites-list">
              {filtered.map((entry, index) => {
                const item = catalogById.get(entry.questionId), folders = data.folders.filter(folder => entry.folderIds.includes(folder.id)).map(folder => folder.id === "default" ? t("默认收藏夹") : folder.name).join("、");
                const title = item ? favoriteTitle(item) : `${loadingImported ? "正在读取" : "暂不可用"} · ${entry.questionId}`;
                const insight = insights.get(entry.questionId);
                return <button key={entry.questionId} type="button" aria-current={activeId === entry.questionId ? "true" : undefined} onClick={() => selectQuestion(entry.questionId)} className={`favorite-preview ${activeId === entry.questionId ? "favorite-preview-current" : ""}`}><span className="flex items-start justify-between gap-3"><span className="text-sm font-semibold leading-6">{t(title)}</span><span aria-hidden="true" className="pt-1 text-xs text-slate-400">{index + 1} →</span></span>{folders && <span className="mt-2 block text-xs leading-5 text-slate-500">{folders}</span>}{insight && <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5"><span className={insight.wrongCount > 0 ? "text-rose-600" : "text-slate-500"}>{t("答错 {count} 次", { count: insight.wrongCount })}</span><span className="text-slate-500">{t(insight.lastCorrect ? "最近答对" : "最近答错")}</span>{insight.wrongCount > 0 && <span className="text-indigo-600">{t(insight.dueAt <= now ? "待复习" : "复习已安排")}</span>}</span>}</button>;
              })}
            </nav>
            {(desktop || mobileDetail || viewMode === "cards") && <div ref={paneRef} className="favorites-detail-pane">
              {viewMode !== "cards" && filtered.length > 1 && <nav aria-label={t("切换收藏题目")} className="mb-3 flex items-center justify-between gap-3 text-sm"><button type="button" onClick={() => selectQuestion(filtered[currentIndex - 1].questionId)} disabled={currentIndex <= 0} className="min-h-11 px-2 font-semibold text-indigo-600 disabled:opacity-30">{t("← 上一道收藏")}</button><span className="text-xs tabular-nums text-slate-400">{currentIndex + 1} / {filtered.length}</span><button type="button" onClick={() => selectQuestion(filtered[currentIndex + 1].questionId)} disabled={currentIndex >= filtered.length - 1} className="min-h-11 px-2 font-semibold text-indigo-600 disabled:opacity-30">{t("下一道收藏 →")}</button></nav>}
              {detailEntries.map(entry => <FavoriteQuestion key={entry.questionId} questionId={entry.questionId} item={catalogById.get(entry.questionId)} folderName={data.folders.filter(folder => entry.folderIds.includes(folder.id)).map(folder => folder.id === "default" ? t("默认收藏夹") : folder.name).join("、")} loading={loadingImported} onBack={returnToList} collectionView={view} wrongCount={insights.get(entry.questionId)?.wrongCount} />)}
            </div>}
          </div>}
        </>}
      </div>
    </main>
  );
}
