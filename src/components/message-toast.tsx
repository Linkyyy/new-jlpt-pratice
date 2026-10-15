"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";

export type FeedbackMessage = { text: string; error: boolean };
export default function MessageToast({ message, onDismiss }: { message: FeedbackMessage | null; onDismiss: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return <div className="fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${message.error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{message.error ? "!" : "✓"}</span>
    <p role={message.error ? "alert" : "status"} className="min-w-0 flex-1 py-1 text-sm leading-6 text-slate-700">{t(message.text)}</p>
    <button type="button" onClick={onDismiss} aria-label={t("关闭提示")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">✕</button>
  </div>;
}
