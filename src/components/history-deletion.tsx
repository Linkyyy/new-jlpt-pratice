"use client";

import { useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useI18n } from "@/lib/i18n";
import { deleteStudyHistory, readStudySnapshot } from "@/lib/study-store";
import { requestCloudBackup as api, CloudRequestError, type CloudState } from "@/lib/cloud-backup-client";
import { LoadingSpinner } from "./loading-skeleton";
import MessageToast, { type FeedbackMessage } from "./message-toast";

export type HistoryDeletionHandle = { open: () => void };
export default function HistoryDeletion({ ref }: { ref: Ref<HistoryDeletionHandle> }) {
  const { t } = useI18n();
  const id = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [busy, setBusy] = useState<"check" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [dialogMessage, setDialogMessage] = useState<FeedbackMessage | null>(null);
  const checking = useRef<AbortController | null>(null);
  async function check() {
    checking.current?.abort();
    const request = new AbortController(); checking.current = request;
    setBusy("check"); setCloud(null); setError(null); setDialogMessage(null);
    try {
      const state: CloudState = await api("/auth");
      if (!request.signal.aborted) setCloud(state);
    } catch {
      if (!request.signal.aborted) setError("无法确认云备份状态，未删除记录。请重试。");
    } finally { if (!request.signal.aborted) setBusy(null); }
  }
  function open() {
    if (busy === "delete") return;
    setMessage(null); dialog.current?.showModal(); void check();
  }
  useImperativeHandle(ref, () => ({ open }));
  async function confirm() {
    if (busy || !cloud) return;
    const snapshot = readStudySnapshot();
    if (!snapshot.ready || snapshot.error) { setDialogMessage({ text: snapshot.error ?? "正在读取学习记录……", error: true }); return; }
    setBusy("delete"); setError(null); setDialogMessage(null);
    let cloudDeleted = false;
    try {
      // Recheck identity even for a local-only confirmation: a different tab may
      // have logged in or out since this dialog was opened.
      const latest: CloudState = await api("/auth");
      if (latest.user?.username !== cloud.user?.username) {
        setCloud(null); setError("登录账号已变化，请重新检查并确认删除。"); return;
      }
      if (cloud.user) {
        await api("/history", { attemptId: null, confirmed: true, expectedUsername: cloud.user.username, expectedRevision: cloud.backup?.revision ?? null }, "DELETE");
        cloudDeleted = true;
      }
      const result = deleteStudyHistory(null, snapshot.data);
      if (!result.ok) {
        setCloud(null);
        setError(cloudDeleted ? "云端记录已删除，本地记录保留。请重新检查后重试。" : result.error);
        return;
      }
      dialog.current?.close();
      setMessage({ text: cloudDeleted ? "本地和云备份中的做题记录已删除，收藏已保留。" : "做题记录已删除，收藏已保留。", error: false });
    } catch (cause) {
      setCloud(null);
      setError(cause instanceof CloudRequestError ? cause.message : "删除失败，本地记录已保留。请检查网络后重试。");
    } finally { setBusy(null); }
  }
  return <>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { if (busy === "delete") event.preventDefault(); }} onClose={() => { if (!dialog.current?.open) checking.current?.abort(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50">
      <h2 id={`${id}-title`} className="text-xl font-bold">{t("清空全部做题记录？")}</h2>
      <p id={`${id}-description`} className="mt-3 text-sm leading-7 text-slate-600">{t("将删除全部练习、考试记录、成绩和学习足迹，此操作无法撤销。收藏题目和收藏夹会保留。")}</p>
      {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LoadingSpinner />{t(busy === "check" ? "正在检查云备份……" : "正在删除记录……")}</p>}
      {cloud && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">{cloud.user ? <>{cloud.user.username} · {t("同时清空这个账号云备份中的全部做题记录。")}</> : t("当前未登录，仅删除此浏览器中的做题记录。")}</p>}
      {error && <div className="mt-4"><p role="alert" className="text-sm leading-6 text-rose-700">{t(error)}</p><button type="button" disabled={Boolean(busy)} onClick={() => { void check(); }} className="mt-2 min-h-11 text-sm font-semibold text-indigo-600 disabled:opacity-40">{t("重新检查")}</button></div>}
      <div className="mt-6 flex gap-3"><button autoFocus type="button" disabled={busy === "delete"} onClick={() => dialog.current?.close()} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">{t("取消")}</button><button type="button" disabled={Boolean(busy) || !cloud} onClick={() => { void confirm(); }} className="min-h-11 flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40">{t("确认清空")}</button></div>
      <MessageToast message={dialogMessage} onDismiss={() => setDialogMessage(null)} />
    </dialog>
    <MessageToast message={message} onDismiss={() => setMessage(null)} />
  </>;
}
