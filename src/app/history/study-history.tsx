"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { importStudyData, useStudyHistory } from "@/lib/study-store";
import { AttemptCard, StudyStats } from "@/components/study-dashboard";

export default function StudyHistory() {
  const { data, ready, error } = useStudyHistory();
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const attempts = [...data.attempts].filter(a => filter === "all" || filter === "active" && a.status !== "completed" || filter === "completed" && a.status === "completed" || a.mode === filter).sort((a, b) => b.updatedAt - a.updatedAt);
  function exportBackup() {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = `jlpt-study-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("备份文件超过 10 MB，请检查文件。");
      const result = importStudyData(JSON.parse(await file.text()));
      setMessage(result.ok ? "备份已合并，已有的完成成绩保持不变。" : result.error);
    } catch (cause) { setMessage(cause instanceof SyntaxError ? "文件不是有效的 JSON 备份，原记录未修改。" : cause instanceof Error ? cause.message : "导入失败，原记录未修改。"); }
    if (input.current) input.current.value = "";
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href="/" className="text-sm font-semibold text-indigo-600">← 首页</Link><h1 className="mt-3 text-2xl font-bold">学习记录</h1></div><div className="flex gap-4 text-sm font-semibold text-indigo-600"><button onClick={exportBackup} disabled={!ready || Boolean(error)} className="min-h-11 disabled:opacity-40">导出备份</button><button onClick={() => input.current?.click()} disabled={!ready || Boolean(error)} className="min-h-11 disabled:opacity-40">导入备份</button><input ref={input} type="file" accept="application/json,.json" aria-label="导入学习记录备份" className="hidden" onChange={event => { void importBackup(event.target.files?.[0]); }} /></div></header>
    <p className="text-sm leading-6 text-slate-500">记录保存在当前浏览器。可导出备份，在其他设备导入；清理浏览器数据会删除本地记录。成绩为答对题数折算的百分制练习分，非 JLPT 官方分数。</p>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800">{message}</p>}
    <StudyStats data={data} ready={ready} />
    <nav aria-label="记录筛选" className="flex flex-wrap gap-2">{[["all", "全部"], ["active", "未完成"], ["completed", "已完成"], ["practice", "练习"], ["exam", "考试"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === value ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{label}</button>)}</nav>
    {!ready ? <p role="status">正在读取学习记录……</p> : attempts.length ? <div className="grid gap-3 md:grid-cols-2">{attempts.map(a => <AttemptCard key={a.id} attempt={a} />)}</div> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-slate-500">{data.attempts.length ? "暂时没有此类记录。" : "还没有学习记录，完成第一道题就能留下足迹。"}</p><Link href="/" className="mt-5 inline-block font-semibold text-indigo-600">去选择练习 →</Link></section>}
  </div></main>;
}
