"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fetchPassageTranslation, n1TranslationIndex, type PassageTranslationReview } from "@/data/passage-translation";
import { useI18n } from "@/lib/i18n";

const controlStyle = "rounded-lg border border-slate-200 font-semibold text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-40";
const control = `min-h-11 px-3 text-sm ${controlStyle}`;

type TranslationView = "sentence" | "paragraph";
interface TranslationButtonProps {
  questionId: string;
}

export default function PassageTranslationButton(props: TranslationButtonProps) {
  return n1TranslationIndex(props.questionId) === undefined ? null : <PassageTranslationReader key={props.questionId} {...props} />;
}

function PassageTranslationReader({ questionId }: TranslationButtonProps) {
  const { t } = useI18n();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const [passage, setPassage] = useState<PassageTranslationReview | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<TranslationView>("paragraph");
  const [revealed, setRevealed] = useState(false);
  const bySentence = view === "sentence" && !passage?.transcribedImage;
  const entries = bySentence ? passage?.sentences : passage?.paragraphs;
  const entry = entries?.[index];

  useEffect(() => () => request.current?.abort(), []);

  async function load() {
    if (passage || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setFailed(false);
    try {
      setPassage(await fetchPassageTranslation(questionId, controller.signal));
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      request.current = null;
    }
  }

  function showEntry(next: number) {
    setIndex(next);
    setRevealed(false);
    scroll.current?.scrollTo({ top: 0 });
  }

  function open() {
    setView("paragraph");
    showEntry(0);
    dialog.current?.showModal();
    void load();
  }

  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id} className={`mt-2 ${control}`} onClick={open}>{t("逐段翻译")}</button>
    <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="passage-translation-dialog">
      <div className="passage-translation-frame">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <h2 id={`${id}-title`} className="text-base font-bold">{t(bySentence ? "逐句翻译" : "逐段翻译")}</h2>
          <div className="flex items-center gap-2">
            {passage && !passage.transcribedImage && <button type="button" className={control} onClick={() => {
              setView(bySentence ? "paragraph" : "sentence");
              showEntry(0);
            }}>{t(bySentence ? "按段查看" : "按句查看")}</button>}
            <button autoFocus type="button" aria-label={t("关闭")} className={`min-w-11 ${control}`} onClick={() => dialog.current?.close()}>×</button>
          </div>
        </header>
        <div ref={scroll} className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {entry ? <>
            {passage?.transcribedImage && <p className="mb-2 text-xs text-slate-500">{t("以下原文转录自题目图片。")}</p>}
            {bySentence && passage?.sentences[index]?.combined && <p className="mb-2 text-xs text-slate-500">{t("这几句原文合在一起对照。")}</p>}
            <p className="text-xs font-semibold text-slate-500">{t("日文原文")}</p>
            <p lang="ja" className="mt-1 whitespace-pre-line break-words text-base leading-8">{entry.original}</p>
            <button type="button" aria-expanded={revealed} aria-controls={`${id}-zh`} className={`mt-4 ${control}`} onClick={() => setRevealed(!revealed)}>
              {t(bySentence ? (revealed ? "隐藏本句译文" : "显示本句译文") : (revealed ? "隐藏本段译文" : "显示本段译文"))}
            </button>
            <div hidden={!revealed} id={`${id}-zh`} className="mt-3 rounded-xl bg-slate-50 p-3 sm:p-4">
              <p className="text-xs font-semibold text-slate-500">{t("中文参考译文")}</p>
              <p lang="zh-CN" className="mt-1 whitespace-pre-line break-words text-base leading-8">{entry.translation}</p>
            </div>
          </> : failed ? (
            <div>
              <p role="alert" className="text-sm text-slate-600">{t("暂时无法加载文章译文。")}</p>
              <button type="button" className={`mt-3 ${control}`} onClick={() => void load()}>{t("重试")}</button>
            </div>
          ) : <p role="status" className="text-sm text-slate-600">{t("正在加载文章译文…")}</p>}
        </div>
        {entries && <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2">
          <button type="button" className={control} disabled={index === 0} onClick={() => showEntry(index - 1)}>{t(bySentence ? "上一句" : "上一段")}</button>
          <output aria-live="polite" className="text-center text-sm tabular-nums">{t(bySentence ? "第 {0} / {1} 条" : "第 {0} / {1} 段", { 0: index + 1, 1: entries.length })}</output>
          <button type="button" className={control} disabled={index === entries.length - 1} onClick={() => showEntry(index + 1)}>{t(bySentence ? "下一句" : "下一段")}</button>
        </footer>}
      </div>
    </dialog>
  </>;
}
