"use client";

import { useI18n } from "@/lib/i18n";
import { articleGroupKey, isWrittenPassage } from "@/app/practice/article-questions";

import QuestionImage from "./question-image";
import type { PracticeQuestion } from "@/data/practice-question";
import RichContent from "./rich-content";
import ListeningPlayer from "./listening-player";
import PassagePen from "./passage-pen";
import InlinePassageTranslation from "./inline-passage-translation";

export default function QuestionBody({ question, part = "all", audioGroupId, inlineTranslation }: { question: PracticeQuestion; part?: "all" | "passage" | "question"; audioGroupId?: string; inlineTranslation?: { questionId: string; enabled: boolean } }) {
  const { t } = useI18n();
  const prompt = part === "question" && question.passage?.trim() === question.prompt.trim()
    ? question.category === "语法" ? t("请选择文章中{0}的答案。", { 0: question.sourceQuestionNumber != null ? t("第 {0} 空", { 0: question.sourceQuestionNumber }) : t("当前空格") }) : t("请根据上方文章选择答案。")
    : question.prompt;
  const passageKey = part !== "question" && isWrittenPassage(question) ? articleGroupKey(question) : null;
  const instruction = part !== "question" && question.instruction && <RichContent text={question.instruction} html={question.richText} lang="ja" className="question-instruction mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-indigo-900" />;
  const passageClassName = `question-text question-passage mt-6 ${part === "passage" && question.richText && question.passage ? "whitespace-normal" : "whitespace-pre-line"} rounded-xl bg-slate-50 p-4 sm:p-5`;
  const translation = inlineTranslation && <InlinePassageTranslation key={inlineTranslation.questionId} {...inlineTranslation} text={question.passage} html={question.richText} className={passageClassName} />;
  const passage = part !== "question" && <>
    {question.passage && (translation || <RichContent text={question.passage} html={question.richText} lang="ja" className={passageClassName} />)}
    {question.media?.images.map(src => <QuestionImage key={src} reference={src} />)}
    {!question.passage && translation}
  </>;
  return (
    <>
      {instruction}
      {passageKey ? <PassagePen key={passageKey} passageKey={passageKey}>{passage}</PassagePen> : passage}
      {part !== "question" && question.media?.audio && <ListeningPlayer reference={question.media.audio} questionId={audioGroupId ?? question.id} />}
      {part !== "passage" && <RichContent text={prompt} html={question.richText} lang="ja" className="question-text mt-4 sm:mt-7 whitespace-pre-line" />}
      {part !== "passage" && question.media?.questionImages?.map(src => <QuestionImage key={src} reference={src} />)}
    </>
  );
}
