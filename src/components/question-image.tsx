"use client";

import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getImageUrl } from "@/lib/image-url.mjs";

export default function QuestionImage({ reference }: { reference: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const url = getImageUrl(reference);
  const src = url && retry ? `${url}?retry=${retry}` : url;
  return <div className="mt-5">
    {failed || !src ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <p>{t("题目图片暂时无法加载，请稍后重试。")}</p>
      <button type="button" onClick={() => { setLoaded(false); setRetry(value => value + 1); setFailed(false); }} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-amber-300 px-3 font-semibold hover:bg-amber-100">{t("重新加载图片")}</button>
    </div> : <div className="relative min-h-32">
      {!loaded && <div role="status" aria-label={t("正在加载图片……")} className="absolute inset-0 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />}
      <Image key={src} src={src} alt={t("题目配图")} width={1024} height={768} unoptimized loading="lazy" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={`h-auto max-h-[80vh] w-full object-contain ${loaded ? "" : "opacity-0"}`} />
    </div>}
  </div>;
}
