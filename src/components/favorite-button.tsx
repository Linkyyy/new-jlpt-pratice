"use client";

import { useI18n } from "@/lib/i18n";

import { useRef, useState, type FormEvent } from "react";
import { DEFAULT_FOLDER_ID, removeFavorite, saveFavorite, useFavorites } from "@/lib/favorites-store";

export default function FavoriteButton({ questionId }: { questionId: string }) {
  const { t } = useI18n();
  const { data, ready, error: storageError } = useFavorites();
  const entry = data.entries.find((entry) => entry.questionId === questionId);
  const folderName = data.folders.filter((folder) => entry?.folderIds.includes(folder.id)).map((folder) => folder.id === "default" ? t("默认收藏夹") : folder.name).join("、");
  const [folderIds, setFolderIds] = useState<readonly string[]>([DEFAULT_FOLDER_ID]);
  const [createNew, setCreateNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `${questionId}-favorite-title`;

  function openDialog() {
    setFolderIds(entry?.folderIds ?? [DEFAULT_FOLDER_ID]);
    setCreateNew(false);
    setNewFolderName("");
    setError(null);
    setMessage("");
    dialogRef.current?.showModal();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = saveFavorite(questionId, folderIds, createNew ? newFolderName : undefined);
    if (!result.ok) { setError(result.error); return; }
    setMessage(entry ? "收藏夹已更新。" : "题目已收藏。" );
    dialogRef.current?.close();
  }

  function remove() {
    const result = removeFavorite(questionId);
    if (!result.ok) { setError(result.error); return; }
    setMessage("已取消收藏。");
    dialogRef.current?.close();
  }

  return (
    <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
      <button type="button" onClick={openDialog} disabled={!ready || storageError !== null} aria-label={t(entry ? `管理收藏：${folderName}` : "收藏本题")} title={t(storageError ?? (entry ? `已收藏 · ${folderName}` : "收藏本题"))} className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${entry ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={entry ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" /></svg>
      </button>
      <p role="status" className="sr-only">{t(storageError ?? message)}</p>
      <dialog ref={dialogRef} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50">
        <h2 id={titleId} className="text-xl font-bold">{t(entry ? "管理题目收藏" : "收藏题目")}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{t("一道题可以同时加入多个收藏夹。收藏保存在当前浏览器，不包含作答记录。")}</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold">{t("选择收藏夹（可多选）")}</legend>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {data.folders.map((folder, index) => <label key={folder.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50">
                <input autoFocus={index === 0} type="checkbox" checked={folderIds.includes(folder.id)} onChange={(event) => { setFolderIds((previous) => event.target.checked ? [...previous, folder.id] : previous.filter((id) => id !== folder.id)); setError(null); }} className="h-4 w-4 accent-indigo-600" />
                {folder.id === "default" ? t("默认收藏夹") : folder.name}
              </label>)}
            </div>
          </fieldset>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={createNew} onChange={(event) => setCreateNew(event.target.checked)} className="h-4 w-4 accent-indigo-600" />{t("新建收藏夹")}</label>
          {createNew && <label className="block text-sm font-semibold">{t("新收藏夹名称")}<input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} maxLength={40} required className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 text-base" placeholder={t("例如：易混淆语法")} />
          </label>}
          {error && <p role="alert" className="text-sm text-rose-700">{t(error)}</p>}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50">{t("取消")}</button>
            <button type="submit" className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700">{t("保存收藏")}</button>
          </div>
          {entry && <button type="button" onClick={remove} className="min-h-11 w-full rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">{t("取消收藏")}</button>}
        </form>
      </dialog>
    </div>
  );
}
