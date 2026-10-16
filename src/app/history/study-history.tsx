"use client";

import LoadingSkeleton from "@/components/loading-skeleton";
import { useI18n } from "@/lib/i18n";

import { useState } from "react";
import Link from "next/link";
import { useStudyHistory } from "@/lib/study-store";
import { AttemptCard, StudyStats } from "@/components/study-dashboard";
import BackupControls from "@/components/backup-controls";

export default function StudyHistory() {
  const { t } = useI18n();
  const { data, ready, error } = useStudyHistory();
  const [filter, setFilter] = useState("all");
  const attempts = [...data.attempts].filter(a => filter === "all" || filter === "active" && a.status !== "completed" || filter === "completed" && a.status === "completed" || a.mode === filter).sort((a, b) => b.updatedAt - a.updatedAt);
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/" className="text-sm font-semibold text-indigo-600">{t("← 首页")}</Link><h1 className="mt-3 text-2xl font-bold">{t("学习记录")}</h1></div><BackupControls /></header>
    <p className="text-sm leading-6 text-slate-500">{t("登录云备份账号，可保存全部收藏与做题记录，并在其他设备导入。词汇与语法合计 60 分，阅读、听力各 60 分，整卷满分 180，均为练习估分。")}</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{t(error)}</p>}
    <StudyStats data={data} ready={ready} />
    <nav aria-label={t("记录筛选")} className="flex flex-wrap gap-2">{[["all", "全部"], ["active", "未完成"], ["completed", "已完成"], ["practice", "练习"], ["exam", "考试"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === value ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{t(label)}</button>)}</nav>
    {!ready ? <LoadingSkeleton label="正在读取学习记录……" /> : attempts.length ? <div className="grid gap-3 md:grid-cols-2">{attempts.map(a => <AttemptCard key={a.id} attempt={a} />)}</div> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-slate-500">{t(data.attempts.length ? "暂时没有此类记录。" : "还没有学习记录，完成第一道题就能留下足迹。")}</p><Link href="/" className="mt-5 inline-block font-semibold text-indigo-600">{t("去选择练习 →")}</Link></section>}
  </div></main>;
}
