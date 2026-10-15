"use client";

import { useI18n } from "@/lib/i18n";
import { LoadingSpinner } from "./loading-skeleton";

export default function PracticeStartButton({ label, disabled, pending }: { label: string; disabled: boolean; pending: boolean }) {
  const { t } = useI18n();
  return <button type="submit" disabled={disabled || pending} aria-busy={pending} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300">{pending && <LoadingSpinner />}{t(pending ? "正在准备练习卷……" : label)}{!pending && " →"}</button>;
}
