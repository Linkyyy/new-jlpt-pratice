"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isPassageTranslation, n1TranslationIndex, type PassageTranslation } from "@/data/passage-translation";
import { useI18n } from "@/lib/i18n";

const control = "min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40";

export default function PassageTranslationButton({ questionId }: { questionId: string }) {
  return n1TranslationIndex(questionId) === undefined ? null : <PassageTranslationReader key={questionId} questionId={questionId} />;
}

function PassageTranslationReader({ questionId }: { questionId: string }) {
  const { t } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const [passage, setPassage] = useState<PassageTranslation | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const paragraph = passage?.paragraphs[index];

  useEffect(() => () => request.current?.abort(), []);

  async function load() {
    if (passage || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setFailed(false);
    try {
      const query = new URLSearchParams({ id: questionId });
      const response = await fetch(`/api/practice/passage-translation?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Passage translation request failed");
      const data: unknown = await response.json();
      if (!isPassageTranslation(data)) throw new Error("Invalid passage translation data");
      setPassage(data);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      request.current = null;
    }
  }

  function showParagraph(next: number) {
    setIndex(next);
    setRevealed(false);
    scroll.current?.scrollTo({ top: 0 });
  }

  function open() {
    showParagraph(0);
    dialog.current?.showModal();
    void load();
  }

  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id} className={`mt-2 ${control}`} onClick={open}>{t("逐段翻译")}</button>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="passage-translation-dialog">
      <div className="passage-translation-frame">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <h2 id={`${id}-title`} className="text-base font-bold">{t("逐段翻译")}</h2>
          <button autoFocus type="button" aria-label={t("关闭")} className={`min-w-11 ${control}`} onClick={() => dialog.current?.close()}>×</button>
        </header>
        <div ref={scroll} className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {paragraph ? <>
            {passage?.transcribedImage && <p className="mb-2 text-xs text-slate-500">{t("以下原文转录自题目图片。")}</p>}
            <p className="text-xs font-semibold text-slate-500">{t("日文原文")}</p>
            <p lang="ja" className="mt-1 whitespace-pre-line break-words text-base leading-8">{paragraph.original}</p>
            <button type="button" aria-expanded={revealed} aria-controls={`${id}-zh`} className={`mt-4 ${control}`} onClick={() => setRevealed(!revealed)}>
              {t(revealed ? "隐藏本段译文" : "显示本段译文")}
            </button>
            <div hidden={!revealed} id={`${id}-zh`} className="mt-3 rounded-xl bg-slate-50 p-3 sm:p-4">
              <p className="text-xs font-semibold text-slate-500">{t("中文参考译文")}</p>
              <p lang="zh-CN" className="mt-1 whitespace-pre-line break-words text-base leading-8">{paragraph.translation}</p>
            </div>
          </> : failed ? (
            <div>
              <p role="alert" className="text-sm text-slate-600">{t("暂时无法加载逐段译文。")}</p>
              <button type="button" className={`mt-3 ${control}`} onClick={() => void load()}>{t("重试")}</button>
            </div>
          ) : <p role="status" className="text-sm text-slate-600">{t("正在加载逐段译文…")}</p>}
        </div>
        {passage && <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2">
          <button type="button" className={control} disabled={index === 0} onClick={() => showParagraph(index - 1)}>{t("上一段")}</button>
          <output aria-live="polite" className="text-center text-sm tabular-nums">{t("第 {0} / {1} 段", { 0: index + 1, 1: passage.paragraphs.length })}</output>
          <button type="button" className={control} disabled={index === passage.paragraphs.length - 1} onClick={() => showParagraph(index + 1)}>{t("下一段")}</button>
        </footer>}
      </div>
    </dialog>
  </>;
}
