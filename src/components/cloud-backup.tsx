"use client";

import { useId, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { createLearningBackup, importLearningBackup } from "@/lib/learning-backup";
import ActionLabel, { actionButtonClass } from "./action-label";
import LoadingSkeleton, { LoadingSpinner } from "./loading-skeleton";
import MessageToast, { type FeedbackMessage } from "./message-toast";

type BackupInfo = { revision: string; savedAt: number; bytes: number };
type CloudState = { configured: boolean; user: { username: string } | null; backup: BackupInfo | null };
class RequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/cloud-backup${path}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new RequestError(response.status, result.error ?? "云服务暂时不可用，请稍后重试。");
  return result;
}
const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:outline-2 focus:outline-indigo-500";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40";

export default function CloudBackup({ disabled }: { disabled: boolean }) {
  const { t, locale } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<CloudState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [confirm, setConfirm] = useState<"backup" | "restore" | null>(null);
  const username = useRef<HTMLInputElement>(null), password = useRef<HTMLInputElement>(null);
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setMessage(null);
    try { await action(); }
    catch (error) {
      setMessage({ text: error instanceof RequestError ? error.message : "连接失败，请检查网络后重试。", error: true });
      if (error instanceof RequestError && error.status === 401) { setState({ configured: true, user: null, backup: null }); setConfirm(null); }
      if (error instanceof RequestError && error.status === 409) { setConfirm(null); try { setState(await api("/auth")); } catch { /* Keep the original conflict message. */ } }
    } finally { setBusy(null); }
  }
  function open() {
    dialog.current?.showModal(); setConfirm(null);
    void run("正在连接云备份……", async () => { setState(await api("/auth")); });
  }
  function authenticate(event: React.FormEvent) {
    event.preventDefault();
    const credentials = { action: mode, username: username.current?.value, password: password.current?.value };
    void run(mode === "login" ? "正在登录……" : "正在创建账号……", async () => {
      setState(await api("/auth", credentials));
      if (password.current) password.current.value = "";
      setMessage({ text: mode === "login" ? "登录成功。" : "账号已创建并登录。", error: false });
    });
  }
  function upload() {
    void run("正在备份……", async () => {
      const backup = createLearningBackup();
      if (!backup.ok) throw new RequestError(400, backup.error);
      const result = await api("", { data: backup.data, expectedRevision: state?.backup?.revision ?? null, expectedUsername: state?.user?.username });
      setState(previous => previous ? { ...previous, backup: result.backup } : null); setConfirm(null);
      setMessage({ text: "云备份成功，收藏和学习记录已保存。", error: false });
    });
  }
  function restore() {
    void run("正在恢复……", async () => {
      const result = await api(`?account=${encodeURIComponent(state?.user?.username ?? "")}`);
      const merged = importLearningBackup(result.data);
      if (!merged.ok) throw new RequestError(422, merged.error);
      setState(previous => previous ? { ...previous, backup: result.backup } : null); setConfirm(null);
      setMessage({ text: "云备份已导入，本地收藏和学习记录已合并。", error: false });
    });
  }
  return <>
    <button type="button" aria-label={t("云备份")} title={t("云备份")} onClick={open} className={actionButtonClass}><ActionLabel icon="cloud">{t("云备份")}</ActionLabel></button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { if (password.current) password.current.value = ""; }} className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-900/40 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><h2 id={`${id}-title`} className="text-xl font-bold">{t("云备份")}</h2><button type="button" disabled={Boolean(busy)} onClick={() => dialog.current?.close()} aria-label={t("关闭云备份")} className="settings-toggle disabled:opacity-40">✕</button></div>
      {busy && <p role="status" className="mb-4 flex items-center gap-2 text-sm text-indigo-600"><LoadingSpinner />{t(busy)}</p>}
      {!state ? <>{busy ? <LoadingSkeleton label="正在连接云备份……" /> : <button type="button" onClick={open} className={actionButtonClass}>{t("重新加载")}</button>}</> : !state.configured ? <p className="text-sm leading-7 text-slate-500">{t("云备份尚未配置，请联系站点管理员。")}</p> : !state.user ? <form onSubmit={authenticate}>
        <p className="mb-4 text-sm leading-6 text-slate-500">{t("登录后可跨设备备份收藏和学习记录，不影响直接刷题。")}</p>
        <fieldset disabled={Boolean(busy)} className="space-y-4">
          <label className="block text-sm font-semibold">{t("账号")}<input ref={username} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" aria-describedby={`${id}-help`} className={field} /></label>
          <p id={`${id}-help`} className="text-xs leading-5 text-slate-500">{t("账号需为 3–32 位字母、数字或下划线，密码需为 8–128 位。")}</p>
          <label className="block text-sm font-semibold">{t("密码")}<input ref={password} type="password" name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={8} maxLength={128} className={field} /></label>
          <button type="submit" className={`${primary} w-full`} disabled={Boolean(busy)}>{t(mode === "login" ? "登录" : "创建账号")}</button>
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(null); }} className="min-h-11 w-full text-sm font-semibold text-indigo-600">{t(mode === "login" ? "没有账号？创建账号" : "已有账号？登录")}</button>
        </fieldset>
      </form> : <>
        <div className="rounded-xl bg-slate-50 p-4"><p className="break-all text-sm font-semibold">{state.user.username}</p><p className="mt-2 text-xs leading-6 text-slate-500">{state.backup ? `${t("上次备份")} · ${new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(state.backup.savedAt)} (JST)` : t("这个账号还没有云备份。")}</p></div>
        {confirm ? <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p className="text-sm leading-7">{t(confirm === "backup" ? "将用当前设备的收藏和学习记录替换这个账号的云备份。建议先导入云备份合并其他设备的记录。" : "将云备份合并到当前浏览器，保留本地已有收藏和已完成成绩。")}</p><div className="mt-4 flex gap-2"><button type="button" disabled={Boolean(busy) || disabled} onClick={confirm === "backup" ? upload : restore} className={primary}>{t(confirm === "backup" ? "确认备份" : "确认导入")}</button><button type="button" disabled={Boolean(busy)} onClick={() => setConfirm(null)} className={actionButtonClass}>{t("取消")}</button></div></div> : <div className="mt-5 grid gap-3"><button type="button" disabled={Boolean(busy) || disabled} onClick={() => state.backup ? setConfirm("backup") : upload()} className={primary}><ActionLabel icon="import">{t("备份到云端")}</ActionLabel><span className="sm:hidden">{t("备份到云端")}</span></button><button type="button" disabled={Boolean(busy) || disabled || !state.backup} onClick={() => setConfirm("restore")} className={actionButtonClass}><ActionLabel icon="export">{t("从云端导入")}</ActionLabel><span className="sm:hidden">{t("从云端导入")}</span></button></div>}
        <p className="mt-4 text-xs leading-6 text-slate-500">{t("云备份包含全部收藏夹、收藏题和学习记录；每个账号保留一份最新备份。")}</p>
        <button type="button" disabled={Boolean(busy)} onClick={() => { void run("正在退出……", async () => { await api("/auth", { action: "logout" }); setState({ configured: true, user: null, backup: null }); setConfirm(null); setMessage({ text: "已退出云备份账号，本地记录保留。", error: false }); }); }} className="mt-3 min-h-11 text-sm font-semibold text-slate-500 disabled:opacity-40">{t("退出账号")}</button>
      </>}
      {disabled && <p className="mt-3 text-xs leading-6 text-amber-800">{t("本地记录尚未就绪或无法读取，请检查存储权限后重试。")}</p>}
      <MessageToast message={message} onDismiss={() => setMessage(null)} />
    </dialog>
  </>;
}
