import type { ReactNode } from "react";

export const actionButtonClass = "inline-flex h-11 min-w-11 w-11 shrink-0 sm:w-auto items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-0 text-sm sm:px-3 font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40";

export default function ActionLabel({ icon, children, alwaysShowText = false }: { icon: "import" | "export" | "favorites" | "history" | "cloud"; children: ReactNode; alwaysShowText?: boolean }) {
  return <><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {icon === "cloud" ? <path d="M7 18a5 5 0 1 1 .8-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 19 18H7Z" /> : icon === "favorites" ? <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /> : icon === "history" ? <><path d="M3 11a9 9 0 1 1 2.6 7.4M3 5v6h6" /><path d="M12 7v5l3 2" /></> : <><path d={icon === "export" ? "M12 3v12m-4-4 4 4 4-4" : "M12 16V4m-4 4 4-4 4 4"} /><path d="M5 16v4h14v-4" /></>}
  </svg><span className={alwaysShowText ? "inline" : "hidden sm:inline"}>{children}</span></>;
}
