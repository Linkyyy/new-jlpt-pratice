"use client";

import { useState } from "react";
import ListeningPlayer from "@/components/listening-player";
import { getAudioUrl } from "@/lib/audio-url.mjs";

const samples = [
  { id: "r2-test-1", title: "测试音频 1", description: "女声 · Audio test one", reference: "audio/202412n2/1.mp3" },
  { id: "r2-test-2", title: "测试音频 2", description: "男声 · Audio test two", reference: "audio/202412n2/2.mp3" },
] as const;

export default function AudioTestPlayer() {
  const [selected, setSelected] = useState(0);
  const sample = samples[selected];
  const url = getAudioUrl(sample.reference);

  return (
    <div className="mt-5">
      <nav aria-label="测试音频选择" className="flex gap-2">
        {samples.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}
          className={`min-h-11 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${selected === index ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"}`}>{item.title}</button>)}
      </nav>
      <h2 className="mt-5 font-semibold">{sample.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{sample.description}</p>
      <ListeningPlayer reference={sample.reference} questionId={sample.id} />
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:underline">直接打开本段音频 ↗</a>}
    </div>
  );
}
