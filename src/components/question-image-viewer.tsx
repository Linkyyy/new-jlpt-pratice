"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";

interface Props {
  src: string;
  width: number;
  height: number;
  onClose: () => void;
}

const control = "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30";

export default function QuestionImageViewer({ src, width, height, onClose }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const stage = stageRef.current;
    if (!dialog || !stage) return;
    dialog.showModal();
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
      // Next can hide a preserved page without unmounting its portal.
      dialog.close();
    };
  }, []);

  const fit = Math.max(0, Math.min((viewport.width - 32) / width, (viewport.height - 32) / height));
  const imageWidth = width * fit * zoom;
  const imageHeight = height * fit * zoom;
  const imageSrc = retry ? `${src}${src.includes("?") ? "&" : "?"}viewerRetry=${retry}` : src;
  function close() { dialogRef.current?.close(); }

  return createPortal(<dialog ref={dialogRef} data-fullscreen aria-label={t("题目图片预览")} onClose={event => { if (!event.currentTarget.open) onClose(); }}
    onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) close(); }}
    className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none overflow-hidden rounded-none border-0 bg-slate-950 p-0 text-white backdrop:bg-black/90">
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2" style={{ paddingTop: "max(8px, env(safe-area-inset-top))", paddingLeft: "max(12px, env(safe-area-inset-left))", paddingRight: "max(12px, env(safe-area-inset-right))" }}>
        <p className="text-sm">{t("题目配图")}</p>
        <div className="flex items-center gap-1">
          <button type="button" disabled={zoom <= 1 || failed} onClick={() => setZoom(value => Math.max(1, value - .5))} aria-label={t("缩小图片")} title={t("缩小图片")} className={control}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14" /></svg></button>
          <button type="button" disabled={zoom >= 4 || failed} onClick={() => setZoom(value => Math.min(4, value + .5))} aria-label={t("放大图片")} title={t("放大图片")} className={control}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14M12 5v14" /></svg></button>
          <button type="button" disabled={failed} onClick={() => { setZoom(1); stageRef.current?.scrollTo({ top: 0, left: 0 }); }} aria-label={t("适应屏幕")} title={t("适应屏幕")} className={control}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /></svg></button>
          <button autoFocus type="button" onClick={close} aria-label={t("关闭图片预览")} title={t("关闭图片预览")} className={control}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
      </div>
      <div ref={stageRef} tabIndex={0} className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
        {failed ? <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm leading-6"><p>{t("题目图片暂时无法加载，请稍后重试。")}</p><button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1); }} className="min-h-11 rounded-lg border border-white/40 px-4">{t("重新加载图片")}</button></div>
          : <div className="flex min-h-full min-w-full items-center justify-center p-4" style={{ width: Math.max(viewport.width, imageWidth + 32), height: Math.max(viewport.height, imageHeight + 32) }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
            <Image src={imageSrc} alt={t("题目配图")} width={width} height={height} unoptimized draggable={false} onError={() => setFailed(true)} className="max-w-none shrink-0 select-none" style={{ width: imageWidth, height: imageHeight }} />
          </div>}
      </div>
    </div>
  </dialog>, document.body);
}
