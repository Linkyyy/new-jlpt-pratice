"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CatalogQuestion } from "@/data/practice-papers";
import { isCatalogQuestion, isRecord } from "@/data/question-validation";
import { DEFAULT_FOLDER_ID, organizeFavorites, useFavorites, type FavoriteBatchAction } from "@/lib/favorites-store";
import { useI18n } from "@/lib/i18n";
import { favoriteTitle } from "@/app/favorites/favorite-question";

const field = "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900";
const button = "min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40";
function normalize(value: string) { return value.replace(/<[^>]*>/g, " ").normalize("NFKC").toLocaleLowerCase(); }

export default function FavoriteOrganizer({ catalog, initialFolderId = "all" }: { catalog: readonly CatalogQuestion[]; initialFolderId?: string }) {
  const { t } = useI18n();
  const { data, ready, error: storageError } = useFavorites();
  const id = useId(), dialog = useRef<HTMLDialogElement>(null), confirmation = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [scope, setScope] = useState("all"), [target, setTarget] = useState(DEFAULT_FOLDER_ID);
  const [selected, setSelected] = useState<readonly string[]>([]), [pending, setPending] = useState<readonly string[]>([]);
  const [message, setMessage] = useState(""), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<readonly CatalogQuestion[]>([]), [request, setRequest] = useState({ key: "", error: false });
  const known = new Map([...catalog, ...remote].map(item => [item.question.id, item]));
  const missing = data.entries.filter(entry => entry.questionId.startsWith("imported:") && !known.has(entry.questionId)).map(entry => entry.questionId).sort().join("|");
  const loading = open && Boolean(missing) && request.key !== missing;
  useEffect(() => {
    if (!open || !missing) return;
    const controller = new AbortController();
    async function load() {
      try {
        const ids = missing.split("|"), items: CatalogQuestion[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const response = await fetch("/api/favorites/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 100) }), signal: controller.signal });
          if (!response.ok) throw new Error("Failed to load favorite metadata");
          const body: unknown = await response.json();
          if (!isRecord(body) || !Array.isArray(body.questions) || !body.questions.every(isCatalogQuestion)) throw new Error("Invalid questions");
          items.push(...body.questions);
        }
        if (!controller.signal.aborted) { setRemote(previous => [...new Map([...previous, ...items].map(item => [item.question.id, item])).values()]); setRequest({ key: missing, error: false }); }
      } catch { if (!controller.signal.aborted) setRequest({ key: missing, error: true }); }
    }
    void load();
    return () => controller.abort();
  }, [open, missing, retry]);
  useEffect(() => { const main = dialog.current, confirm = confirmation.current; return () => { confirm?.close(); main?.close(); }; }, []);

  const activeScope = data.folders.some(folder => folder.id === scope) ? scope : "all";
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const entries = data.entries.filter(entry => {
    if (activeScope !== "all" && !entry.folderIds.includes(activeScope)) return false;
    const item = known.get(entry.questionId);
    const folders = data.folders.filter(folder => entry.folderIds.includes(folder.id)).map(folder => folder.id === DEFAULT_FOLDER_ID ? t("默认收藏夹") : folder.name).join(" ");
    const text = normalize([entry.questionId, folders, item && favoriteTitle(item), item?.question.prompt, item?.question.passage].filter(Boolean).join(" "));
    return tokens.every(token => text.includes(token));
  });
  const selectedIds = new Set(selected);
  const chosen = entries.filter(entry => selectedIds.has(entry.questionId)).map(entry => entry.questionId);
  const targetExists = data.folders.some(folder => folder.id === target);
  function openOrganizer() {
    setQuery(""); setScope(initialFolderId); setTarget(data.folders.some(folder => folder.id === initialFolderId) ? initialFolderId : DEFAULT_FOLDER_ID);
    setSelected([]); setMessage(""); setError(null); setOpen(true); dialog.current?.showModal();
  }
  function apply(action: FavoriteBatchAction, ids: readonly string[] = chosen) {
    const result = organizeFavorites(ids, action, target);
    if (!result.ok) { setError(result.error); return; }
    setError(null); setSelected([]);
    setMessage(result.changedCount ? t(action === "unfavorite" ? "已取消 {0} 道题的收藏。" : "已整理 {0} 道收藏题。", { 0: result.changedCount }) : t("没有需要修改的收藏。"));
  }
  return <>
    <button type="button" onClick={openOrganizer} disabled={!ready || Boolean(storageError)} className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-50`}>{t("批量整理收藏")}</button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onClose={event => { if (!event.currentTarget.open) setOpen(false); }} className="fixed inset-0 m-auto w-[calc(100vw-32px)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40">
      <div className="flex h-[min(720px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3"><h2 id={`${id}-title`} className="text-lg font-bold">{t("批量整理收藏")}</h2><button type="button" onClick={() => dialog.current?.close()} aria-label={t("关闭批量整理")} className={button}>✕</button></header>
        <div className="grid shrink-0 grid-cols-2 gap-3 px-4 pt-2">
          <label className="min-w-0 text-xs font-semibold text-slate-500">{t("搜索收藏题目")}<input autoFocus type="search" value={query} onChange={event => { setQuery(event.target.value); setSelected([]); }} placeholder={t("年份、题号或题干关键词")} className={field} /></label>
          <label className="min-w-0 text-xs font-semibold text-slate-500">{t("收藏夹")}<select aria-label={t("整理范围")} value={activeScope} onChange={event => { setScope(event.target.value); setSelected([]); }} className={field}><option value="all">{t("全部收藏夹")}</option>{data.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.id === DEFAULT_FOLDER_ID ? t("默认收藏夹") : folder.name}</option>)}</select></label>
        </div>
        <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-4 text-xs"><label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" checked={entries.length > 0 && chosen.length === entries.length} disabled={!entries.length} onChange={event => setSelected(event.target.checked ? entries.map(entry => entry.questionId) : [])} className="h-4 w-4 accent-indigo-600" />{t("全选当前结果")}</label><p className="tabular-nums text-slate-500">{t("已选 {0} / {1} 题", { 0: chosen.length, 1: entries.length })}</p></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-3" aria-label={t("待整理收藏题目")}>
          {loading && <p role="status" className="text-xs leading-6 text-slate-500">{t("正在读取题目信息……")}</p>}
          {request.error && request.key === missing && <p role="status" className="text-xs leading-6 text-amber-800">{t("部分题目信息加载失败，可重试或按题号整理。")}<button type="button" onClick={() => { setRequest({ key: "", error: false }); setRetry(value => value + 1); }} className="min-h-11 px-2 font-semibold underline">{t("重试")}</button></p>}
          {!entries.length && <p className="py-6 text-center text-sm text-slate-500">{t("没有匹配的收藏题目。")}</p>}
          {entries.map(entry => { const item = known.get(entry.questionId); return <label key={entry.questionId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.has(entry.questionId)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, entry.questionId] : previous.filter(id => id !== entry.questionId)); setMessage(""); }} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" /><span className="min-w-0"><span className="block break-words text-sm font-semibold leading-6">{item ? t(favoriteTitle(item)) : entry.questionId}</span><span className="mt-1 block break-words text-xs leading-5 text-slate-500">{data.folders.filter(folder => entry.folderIds.includes(folder.id)).map(folder => folder.id === DEFAULT_FOLDER_ID ? t("默认收藏夹") : folder.name).join(" · ")}</span>{item && <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{item.question.prompt.replace(/<[^>]*>/g, " ")}</span>}</span></label>; })}
        </div>
        <footer className="shrink-0 border-t border-slate-200 px-4 py-3"><label className="block text-xs font-semibold text-slate-500">{t("目标收藏夹")}<select aria-label={t("目标收藏夹")} value={targetExists ? target : ""} onChange={event => setTarget(event.target.value)} className={field}><option value="" disabled>{t("选择收藏夹")}</option>{data.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.id === DEFAULT_FOLDER_ID ? t("默认收藏夹") : folder.name}</option>)}</select></label>
          <div className="mt-3 grid grid-cols-3 gap-2"><button type="button" disabled={!chosen.length || !targetExists || Boolean(storageError)} onClick={() => apply("add-to-folder")} aria-label={t("批量加入收藏夹")} className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}>{t("加入")}</button><button type="button" disabled={!chosen.length || !targetExists || Boolean(storageError)} onClick={() => apply("remove-from-folder")} aria-label={t("批量移出收藏夹")} className={`${button} border border-slate-300 text-slate-700 hover:bg-slate-50`}>{t("移出")}</button><button type="button" disabled={!chosen.length || Boolean(storageError)} onClick={() => { setPending([...chosen]); setError(null); confirmation.current?.showModal(); }} className={`${button} min-w-0 break-words whitespace-normal text-rose-700 hover:bg-rose-50`}>{t("取消收藏")}</button></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("移出仅调整归属，无其他归属的题目保留在默认收藏夹。")}</p>
          {message && <p role="status" className="mt-2 text-sm text-emerald-700">{message}</p>}{(error || storageError) && <p role="alert" className="mt-2 text-sm leading-6 text-rose-700">{t(error ?? storageError)}</p>}
        </footer>
      </div>
    </dialog>
    <dialog ref={confirmation} aria-labelledby={`${id}-confirm-title`} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50">
      <h2 id={`${id}-confirm-title`} className="text-lg font-bold">{t("取消所选收藏？")}</h2><p className="mt-3 text-sm leading-7 text-slate-600">{t("将取消 {0} 道题的全部收藏归属，做题记录和错题记录保留。", { 0: pending.length })}</p><div className="mt-5 grid grid-cols-2 gap-3"><button autoFocus type="button" onClick={() => confirmation.current?.close()} className={`${button} border border-slate-300`}>{t("取消")}</button><button type="button" onClick={() => { apply("unfavorite", pending); confirmation.current?.close(); }} className={`${button} bg-rose-50 text-rose-700 hover:bg-rose-100`}>{t("确认取消收藏")}</button></div>
    </dialog>
  </>;
}
