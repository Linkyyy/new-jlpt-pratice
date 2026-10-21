"use client";

import { useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { createLearningBackup, importLearningBackup } from "@/lib/learning-backup";
import { requestCloudBackup as api, CloudRequestError as RequestError, type CloudState } from "@/lib/cloud-backup-client";
import ActionLabel, { actionButtonClass } from "./action-label";
import LoadingSkeleton, { LoadingSpinner } from "./loading-skeleton";
import MessageToast, { type FeedbackMessage } from "./message-toast";
import HistoryDeletion, { type HistoryDeletionHandle } from "./history-deletion";

const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:outline-2 focus:outline-indigo-500";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40";
const secondary = "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40";

export default function CloudBackup({ disabled, onAccountChange }: { disabled: boolean; onAccountChange?: (username: string | null) => void }) {
  const { t, locale } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const deletion = useRef<HistoryDeletionHandle>(null);
  const clearHistoryButton = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<CloudState | null>(null);
  const lastUsername = useRef<string | null | undefined>(undefined);
  function changeCloudState(next: CloudState) {
    setState(next);
    const current = next.user?.username ?? null;
    if (lastUsername.current !== current) { lastUsername.current = current; onAccountChange?.(current); }
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [confirm, setConfirm] = useState<"backup" | "restore" | null>(null);
  const username = useRef<HTMLInputElement>(null), password = useRef<HTMLInputElement>(null), confirmPassword = useRef<HTMLInputElement>(null);
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setMessage(null);
    try { await action(); }
    catch (error) {
      setMessage({ text: error instanceof RequestError ? error.message : "连接失败，请检查网络后重试。", error: true });
      if (error instanceof RequestError && error.status === 401) { changeCloudState({ configured: true, user: null, backup: null }); setConfirm(null); }
      if (error instanceof RequestError && error.status === 409) { setConfirm(null); try { changeCloudState(await api("/auth")); } catch { /* Keep the original conflict message. */ } }
    } finally { setBusy(null); }
  }
  function open() {
    dialog.current?.showModal(); setConfirm(null);
    void run("正在连接云备份……", async () => { changeCloudState(await api("/auth")); });
  }
  function clearHistory() {
    if (busy || disabled) return;
    setConfirm(null); setMessage(null);
    dialog.current?.close();
    deletion.current?.open();
  }
  function returnFromHistory(message: FeedbackMessage | null) {
    if (!dialog.current?.open) dialog.current?.showModal();
    setState(null);
    // Clearing can update the remote revision even when a local write fails.
    // Refresh on every return, including cancellation, before another backup.
    void run("正在连接云备份……", async () => {
      changeCloudState(await api("/auth"));
      if (message) setMessage(message);
    }).finally(() => clearHistoryButton.current?.focus());
  }
  function authenticate(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "register" && confirmPassword.current?.value !== password.current?.value) {
      setMessage({ text: "两次输入的密码不一致。", error: true });
      confirmPassword.current?.focus();
      return;
    }
    const credentials = { action: mode, username: username.current?.value, password: password.current?.value, ...(mode === "register" ? { confirmPassword: confirmPassword.current?.value } : {}) };
    void run(mode === "login" ? "正在登录……" : "正在创建账号……", async () => {
      changeCloudState(await api("/auth", credentials));
      if (password.current) password.current.value = "";
      if (confirmPassword.current) confirmPassword.current.value = "";
      setMessage({ text: mode === "login" ? "登录成功。" : "账号已创建并登录。", error: false });
    });
  }
  function upload() {
    void run("正在备份……", async () => {
      const backup = createLearningBackup();
      if (!backup.ok) throw new RequestError(400, backup.error);
      const result = await api("", { data: backup.data, expectedRevision: state?.backup?.revision ?? null, expectedUsername: state?.user?.username });
      setState(previous => previous ? { ...previous, backup: result.backup } : null); setConfirm(null);
      setMessage({ text: "云备份成功，收藏、学习记录和设置已保存。", error: false });
    });
  }
  function restore() {
    void run("正在恢复……", async () => {
      const result = await api(`?account=${encodeURIComponent(state?.user?.username ?? "")}`);
      const merged = importLearningBackup(result.data);
      if (!merged.ok) throw new RequestError(422, merged.error);
      setState(previous => previous ? { ...previous, backup: result.backup } : null); setConfirm(null);
      setMessage({ text: "云备份已导入，收藏和学习记录已合并，设置已恢复。", error: false });
    });
  }
  return <>
    <button type="button" aria-label={t("云备份")} title={t("云备份")} onClick={open} className={actionButtonClass}><ActionLabel icon="cloud">{t("云备份")}</ActionLabel></button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => {
      if (dialog.current?.open) return;
      if (password.current) password.current.value = "";
      if (confirmPassword.current) confirmPassword.current.value = "";
    }} className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-xl font-bold">{t("云备份")}</h2><button type="button" disabled={Boolean(busy)} onClick={() => dialog.current?.close()} aria-label={t("关闭云备份")} className="settings-toggle disabled:opacity-40">✕</button></div>
      {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm text-indigo-600"><LoadingSpinner />{t(busy)}</p>}
      {!state ? <>{busy ? <LoadingSkeleton label="正在连接云备份……" /> : <button type="button" onClick={open} className={secondary}>{t("重新加载")}</button>}</> : !state.configured ? <p className="text-sm leading-7 text-slate-500">{t("云备份尚未配置，请联系站点管理员。")}</p> : !state.user ? <form onSubmit={authenticate}>
        {mode === "register" && <p className="mb-4 text-sm leading-6 text-slate-500">{t("登录后可跨设备备份收藏和学习记录，不影响直接刷题。")}</p>}
        <fieldset disabled={Boolean(busy)} className="space-y-4">
          <label className="block text-sm font-semibold">{t("账号")}<input ref={username} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" aria-describedby={mode === "register" ? `${id}-help` : undefined} className={field} /></label>
          {mode === "register" && <p id={`${id}-help`} className="text-xs leading-5 text-slate-500">{t("账号需为 3–32 位字母、数字或下划线，密码需为 8–128 位。")}</p>}
          <label className="block text-sm font-semibold">{t("密码")}<input ref={password} type="password" name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={8} maxLength={128} className={field} /></label>
          {mode === "register" && <label className="block text-sm font-semibold">{t("确认密码")}<input ref={confirmPassword} type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} maxLength={128} className={field} /></label>}
          <button type="submit" className={`${primary} w-full`} disabled={Boolean(busy)}>{t(mode === "login" ? "登录" : "创建账号")}</button>
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(null); }} className="min-h-11 w-full text-sm font-semibold text-indigo-600">{t(mode === "login" ? "没有账号？创建账号" : "已有账号？登录")}</button>
        </fieldset>
      </form> : <>
        <div className="rounded-xl bg-slate-50 p-4"><p className="break-all text-sm font-semibold">{state.user.username}</p><p className="mt-2 text-xs leading-6 text-slate-500">{state.backup ? `${t("上次备份")} · ${new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(state.backup.savedAt)} (JST)` : t("这个账号还没有云备份。")}</p></div>
        {confirm ? <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-sm leading-7">{t(confirm === "backup" ? "将用当前设备的收藏、学习记录和个人设置替换云备份。建议先导入合并其他设备的记录。" : "将云备份合并到当前浏览器，保留本地已有收藏和已完成成绩，个人设置采用备份中的设置。")}</p><div className="mt-4 grid gap-2 sm:flex"><button type="button" disabled={Boolean(busy) || disabled} onClick={confirm === "backup" ? upload : restore} className={primary}>{t(confirm === "backup" ? "确认备份" : "确认导入")}</button><button type="button" disabled={Boolean(busy)} onClick={() => setConfirm(null)} className={secondary}>{t("取消")}</button></div></div> : <div className="mt-5 grid gap-3"><button type="button" disabled={Boolean(busy) || disabled} onClick={() => state.backup ? setConfirm("backup") : upload()} className={`${primary} w-full`}><ActionLabel icon="import" alwaysShowText>{t("备份到云端")}</ActionLabel></button><button type="button" disabled={Boolean(busy) || disabled || !state.backup} onClick={() => setConfirm("restore")} className={`${secondary} w-full`}><ActionLabel icon="export" alwaysShowText>{t("从云端导入")}</ActionLabel></button></div>}
        <p className="mt-4 text-xs leading-6 text-slate-500">{t("云备份包含收藏题、词条收藏与复习进度、学习记录和个人设置；每个账号保留一份最新备份。")}</p>

      </>}
      {disabled && <p className="mt-3 text-xs leading-6 text-amber-800">{t("本地记录尚未就绪或无法读取，请检查存储权限后重试。")}</p>}
      <div className="mt-4 flex items-center justify-between gap-4">{state?.user ? <button type="button" disabled={Boolean(busy)} onClick={() => { void run("正在退出……", async () => { await api("/auth", { action: "logout" }); changeCloudState({ configured: true, user: null, backup: null }); setConfirm(null); setMessage({ text: "已退出云备份账号，本地记录保留。", error: false }); }); }} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-500 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40">{t("退出账号")}</button> : <span />}<button ref={clearHistoryButton} type="button" disabled={Boolean(busy) || disabled} onClick={clearHistory} aria-label={t("清空做题记录")} className="inline-flex min-h-11 items-center text-sm font-semibold text-rose-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:opacity-40">{t("清空记录")}</button></div>
      <MessageToast message={message} onDismiss={() => setMessage(null)} />
    </dialog>
    <HistoryDeletion ref={deletion} onClose={returnFromHistory} />
  </>;
}
