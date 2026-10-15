"use client";

import { useI18n } from "@/lib/i18n";
import { actionButtonClass } from "./action-label";

export default function HistoryDeleteButton({ disabled = false, onClick }: { disabled?: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={t("清空做题记录")} title={t("清空做题记录")} className={`${actionButtonClass} border-rose-200! bg-rose-50! text-rose-700! hover:bg-rose-100! focus-visible:outline-rose-500!`}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg><span className="hidden sm:inline">{t("清空记录")}</span></button>;
}
