"use client";

import { useRef, useState } from "react";
import { useFavorites } from "@/lib/favorites-store";
import { studyDay, useStudyHistory } from "@/lib/study-store";
import { createLearningBackup, importLearningBackup } from "@/lib/learning-backup";

export default function BackupControls() {
  const favorites = useFavorites(), study = useStudyHistory();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const disabled = !favorites.ready || !study.ready || Boolean(favorites.error || study.error);
  function exportBackup() {
    const result = createLearningBackup();
    if (!result.ok) { setMessage({ text: result.error, error: true }); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.data)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `jlpt-backup-${studyDay()}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ text: "已导出收藏、收藏夹与全部学习记录。", error: false });
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("备份文件超过 10 MB，请检查文件。");
      const result = importLearningBackup(JSON.parse(await file.text()));
      setMessage({ text: result.ok ? "备份已合并，原收藏和已完成成绩保留。" : result.error, error: !result.ok });
    } catch (cause) { setMessage({ text: cause instanceof SyntaxError ? "文件不是有效的 JSON 备份，原记录未修改。" : cause instanceof Error ? cause.message : "导入失败，原记录未修改。", error: true }); }
    if (input.current) input.current.value = "";
  }
  return <div className="max-w-md">
    <div className="flex flex-wrap gap-4 text-sm font-semibold text-indigo-600"><button onClick={exportBackup} disabled={disabled} title="导出收藏、收藏夹和做题记录" className="min-h-11 disabled:opacity-40">导出备份</button><button onClick={() => input.current?.click()} disabled={disabled} title="合并收藏与做题记录，也支持旧版备份" className="min-h-11 disabled:opacity-40">导入备份</button><input ref={input} type="file" accept="application/json,.json" aria-label="导入收藏与学习记录备份" className="hidden" onChange={event => { void importBackup(event.target.files?.[0]); }} /></div>
    {message && <p role={message.error ? "alert" : "status"} className={`mt-1 text-xs leading-6 ${message.error ? "text-rose-700" : "text-slate-500"}`}>{message.text}</p>}
  </div>;
}
