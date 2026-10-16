"use client";

import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getImageUrl } from "@/lib/image-url.mjs";
import QuestionImageViewer from "./question-image-viewer";

export default function QuestionImage({ reference }: { reference: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [size, setSize] = useState({ width: 1024, height: 768 });
  const url = getImageUrl(reference);
  const src = url && retry ? `${url}?retry=${retry}` : url;
  return <div className="mt-5">
    {failed || !src ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <p>{t("题目图片暂时无法加载，请稍后重试。")}</p>
      <button type="button" onClick={() => { setLoaded(false); setRetry(value => value + 1); setFailed(false); }} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-amber-300 px-3 font-semibold hover:bg-amber-100">{t("重新加载图片")}</button>
    </div> : <div className="relative min-h-32">
      {!loaded && <div role="status" aria-label={t("正在加载图片……")} className="absolute inset-0 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />}
      <button type="button" disabled={!loaded} onClick={() => setViewing(true)} aria-label={t("全屏查看题目图片")} title={t("全屏查看题目图片")} aria-haspopup="dialog" aria-expanded={viewing} className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 disabled:cursor-wait">
        <Image key={src} src={src} alt={t("题目配图")} width={1024} height={768} unoptimized loading="lazy" onLoad={event => { setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setLoaded(true); }} onError={() => setFailed(true)} className={`h-auto max-h-[80vh] w-full object-contain ${loaded ? "" : "opacity-0"}`} />
      </button>
    </div>}
    {viewing && src && <QuestionImageViewer src={src} {...size} onClose={() => setViewing(false)} />}
  </div>;
}
