"use client";

import { useI18n } from "@/lib/i18n";

import { useRef, useState, type FormEvent } from "react";
import { createFolder, DEFAULT_FOLDER_ID, deleteFolder, renameFolder, useFavorites, type FavoriteFolder } from "@/lib/favorites-store";

const buttonClass = "min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

function FolderRow({ folder, onRename, onDelete }: { folder: FavoriteFolder; onRename: (name: string) => void; onDelete: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(folder.name);
  if (folder.id === DEFAULT_FOLDER_ID) return <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6">{t("默认收藏夹 · 系统保留，不可删除或重命名")}</p>;
  return (
    <form onSubmit={(event) => { event.preventDefault(); onRename(name); }} className="rounded-xl border border-slate-200 p-3">
      <label className="block text-sm font-semibold">{t("收藏夹名称")}<input aria-label={t(`重命名 ${folder.id === "default" ? t("默认收藏夹") : folder.name}`)} value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required className="mt-2 min-h-12 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className={buttonClass}>{t("保存名称")}</button>
        <button type="button" onClick={onDelete} className={`${buttonClass} text-rose-700`}>{t("删除收藏夹")}</button>
      </div>
    </form>
  );
}

export default function FolderManager() {
  const { t } = useI18n();
  const { data, ready, error: storageError } = useFavorites();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const managerRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const deletingFolder = data.folders.find((folder) => folder.id === deleteId);
  const deletingCount = data.entries.filter((entry) => deleteId !== null && entry.folderIds.includes(deleteId)).length;

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createFolder(name);
    if (!result.ok) { setError(result.error); return; }
    setName(""); setError(null); setMessage("已新建收藏夹。");
  }

  function rename(folderId: string, newName: string) {
    const result = renameFolder(folderId, newName);
    if (!result.ok) { setError(result.error); return; }
    setError(null); setMessage("收藏夹名称已更新。");
  }

  function confirmDelete() {
    if (deleteId === null) return;
    const result = deleteFolder(deleteId);
    if (!result.ok) { setError(result.error); return; }
    deleteRef.current?.close();
    setError(null); setMessage("收藏夹已删除，题目保留在其他收藏夹；无其他归属的题目已移到默认收藏夹。");
  }

  return (
    <>
      <button type="button" onClick={() => { setError(null); setMessage(""); managerRef.current?.showModal(); }} disabled={!ready || storageError !== null} className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}>{t("管理收藏夹")}</button>
      <dialog ref={managerRef} aria-labelledby="folder-manager-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/50 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="folder-manager-title" className="text-xl font-bold">{t("管理收藏夹")}</h2>
          <button type="button" onClick={() => managerRef.current?.close()} className={buttonClass}>{t("关闭")}</button>
        </div>
        <form onSubmit={create} className="mt-5 rounded-xl bg-indigo-50 p-4">
          <label className="block text-sm font-semibold">{t("新收藏夹名称")}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required placeholder={t("例如：阅读长句")} className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base" />
          </label>
          <button type="submit" className="mt-3 min-h-11 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700">{t("新建收藏夹")}</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm leading-6 text-rose-700">{t(error)}</p>}
        <p role="status" className="mt-3 text-sm leading-6 text-slate-500">{t(message)}</p>
        <div className="mt-4 space-y-3">{data.folders.map((folder) => <FolderRow key={`${folder.id}-${folder.id === "default" ? t("默认收藏夹") : folder.name}`} folder={folder} onRename={(name) => rename(folder.id, name)} onDelete={() => { setDeleteId(folder.id); deleteRef.current?.showModal(); }} />)}</div>
      </dialog>
      <dialog ref={deleteRef} aria-labelledby="delete-folder-title" aria-describedby="delete-folder-description" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50">
        <h2 id="delete-folder-title" className="text-xl font-bold">{t("删除收藏夹？")}</h2>
        <p id="delete-folder-description" className="mt-3 text-sm leading-7 break-words text-slate-600">“{deletingFolder?.name}{t("”中的")}{deletingCount} {t("道题会移除此收藏夹归属，题目会保留在其他收藏夹，仅无其他归属的题目移到默认收藏夹。")}</p>
        <form method="dialog" className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button autoFocus className={`${buttonClass} flex-1`}>{t("保留收藏夹")}</button>
          <button type="button" onClick={confirmDelete} className="min-h-12 flex-1 rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700">{t("确认删除收藏夹")}</button>
        </form>
      </dialog>
    </>
  );
}
