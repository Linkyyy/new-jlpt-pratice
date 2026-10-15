"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setDisplayPreferences, useDisplayPreferences } from "@/lib/display-preferences";
import { useI18n } from "@/lib/i18n";
import FloatingSettings from "./floating-settings";

export function DisplaySync() {
  const { theme, locale } = useDisplayPreferences();
  const { t } = useI18n();
  const path = usePathname();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() { document.documentElement.dataset.theme = theme === "dark" || theme === "system" && media.matches ? "dark" : "light"; }
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    const name = path.startsWith("/favorites") ? "我的收藏" : path.startsWith("/history") ? "学习记录" : path.startsWith("/practice") ? "日语题库练习" : "";
    document.title = name ? `${t(name)} | JLPT Practice` : "JLPT Practice";
  }, [locale, path, t]);
  return null;
}
export default function DisplaySettings() {
  const preferences = useDisplayPreferences();
  const { t } = useI18n();
  const [storageError, setStorageError] = useState(false);
  return <div className="display-settings"><FloatingSettings title={t("外观与语言")} icon={<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>}>
    <label className="block text-sm font-semibold">{t("主题")}<select aria-label={t("主题")} value={preferences.theme} onChange={e => setStorageError(!setDisplayPreferences({ theme: e.target.value as typeof preferences.theme }))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"><option value="system">{t("跟随系统")}</option><option value="light">{t("日间")}</option><option value="dark">{t("夜间护眼")}</option></select></label>
    <label className="mt-5 block text-sm font-semibold">{t("界面语言")}<select aria-label={t("界面语言")} value={preferences.locale} onChange={e => setStorageError(!setDisplayPreferences({ locale: e.target.value as typeof preferences.locale }))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base"><option value="zh">中文</option><option value="ja">日本語</option><option value="en">English</option></select></label>
    <p className="mt-4 text-xs leading-6 text-slate-500">{t("仅切换界面语言，题目与原有解析保持原文。")}</p>
    {storageError && <p role="status" className="mt-2 text-xs text-amber-800">{t("当前设置已生效，但浏览器未允许保存。")}</p>}
  </FloatingSettings></div>;
}
