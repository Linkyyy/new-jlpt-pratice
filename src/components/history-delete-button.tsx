"use client";

import { useI18n } from "@/lib/i18n";

export default function HistoryDeleteButton({ all = false, disabled = false, onClick }: { all?: boolean; disabled?: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={t(all ? "清空做题记录" : "删除这条做题记录")} className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 disabled:opacity-40 ${all ? "bg-rose-600 text-white hover:bg-rose-700" : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"}`}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>{t(all ? "清空记录" : "删除")}</button>;
}
