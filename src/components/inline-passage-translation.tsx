"use client";

import { useEffect, useId, useState } from "react";
import { fetchPassageTranslation, type PassageTranslationReview, type TranslatedSentence } from "@/data/passage-translation";
import { useI18n } from "@/lib/i18n";
import RichContent from "./rich-content";

function SentenceTranslation({ sentence }: { sentence: TranslatedSentence }) {
  const { t } = useI18n();
  const id = useId();
  const [open, setOpen] = useState(false);
  const label = t(open ? "隐藏本句译文" : "显示本句译文");

  return <span data-passage-insert="">
    <button type="button" className="passage-inline-translate" aria-label={label} aria-expanded={open} aria-controls={id}
      title={sentence.combined ? t("这几句原文合在一起对照。") : label} onClick={() => setOpen(value => !value)}>{t("译")}</button>
    <span hidden={!open} id={id} lang="zh-CN" className="passage-inline-translation">{open && sentence.translation}</span>
  </span>;
}

interface InlinePassageTranslationProps {
  questionId: string;
  enabled: boolean;
  text?: string;
  html?: boolean;
  className: string;
}

export default function InlinePassageTranslation({ questionId, enabled, text, html, className }: InlinePassageTranslationProps) {
  const { t } = useI18n();
  const [passage, setPassage] = useState<PassageTranslationReview | "failed" | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    fetchPassageTranslation(questionId, request.signal).then(data => {
      if (!request.signal.aborted) setPassage(data);
    }).catch(() => {
      if (!request.signal.aborted) setPassage("failed");
    });
    return () => request.abort();
  }, [enabled, questionId, retry]);

  const sentences = enabled && passage && passage !== "failed" ? passage.sentences : undefined;
  return <>
    {text ? <RichContent text={text} html={html} lang="ja" className={className} insertAfter={sentences?.map(sentence => ({
      original: sentence.original,
      content: <SentenceTranslation sentence={sentence} />,
    }))} /> : sentences && <div className={className}>
      <p className="text-xs text-slate-500">{t("以下原文转录自题目图片。")}</p>
      {sentences.map((sentence, index) => <p key={index} className="mt-3" lang="ja">{sentence.original}<SentenceTranslation sentence={sentence} /></p>)}
    </div>}
    {enabled && passage === "failed" && <p role="status" className="mt-2 text-sm text-slate-600" data-passage-insert="">
      {t("暂时无法加载文章译文。")}
      <button type="button" className="ml-2 rounded px-2 py-1 font-semibold text-indigo-600" onClick={() => { setPassage(null); setRetry(value => value + 1); }}>{t("重试")}</button>
    </p>}
  </>;
}
