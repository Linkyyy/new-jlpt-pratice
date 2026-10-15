"use client";

import { useI18n } from "@/lib/i18n";

export function LoadingSpinner() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" opacity=".2" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>;
}
export default function LoadingSkeleton({ label = "正在加载……", variant = "records", fullPage = false }: { label?: string; variant?: "records" | "question"; fullPage?: boolean }) {
  const { t } = useI18n();
  return <section role="status" aria-label={t(label)} aria-busy="true" className={fullPage ? "min-h-screen bg-slate-50 p-4 sm:p-8" : "w-full"}>
    <span className="sr-only">{t(label)}</span>
    <div aria-hidden="true" className={`mx-auto w-full max-w-5xl motion-safe:animate-pulse ${variant === "records" ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}`}>
      {Array.from({ length: variant === "records" ? 4 : 1 }, (_, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="mb-5 h-4 w-2/5 rounded bg-slate-200" /><div className="mb-3 h-3 w-full rounded bg-slate-100" /><div className="h-3 w-3/4 rounded bg-slate-100" />{variant === "question" && <div className="mt-8 space-y-3">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl border border-slate-200 bg-slate-50" />)}<div className="mt-5 h-11 rounded-xl bg-indigo-50" /></div>}</div>)}
    </div>
  </section>;
}
