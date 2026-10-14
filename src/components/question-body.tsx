import Image from "next/image";
import type { PracticeQuestion } from "@/data/practice-question";
import RichContent from "./rich-content";

export default function QuestionBody({ question, largeText = false, compact = false, part = "all" }: { question: PracticeQuestion; largeText?: boolean; compact?: boolean; part?: "all" | "passage" | "question" }) {
  const prompt = part === "question" && question.passage?.trim() === question.prompt.trim()
    ? question.category === "语法" ? `请选择文章中${question.sourceQuestionNumber != null ? `第 ${question.sourceQuestionNumber} 空` : "当前空格"}的答案。` : "请根据上方文章选择答案。"
    : question.prompt;
  return (
    <>
      {part === "all" && question.instruction && <RichContent text={question.instruction} html={question.richText} lang="ja" className={`${compact ? "hidden lg:block" : ""} mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm leading-7 text-indigo-900`} />}
      {part !== "question" && question.passage && <RichContent text={question.passage} html={question.richText} lang="ja" className={`mt-6 ${part === "passage" && question.richText ? "whitespace-normal" : "whitespace-pre-line"} rounded-xl bg-slate-50 p-4 sm:p-5 ${largeText ? "text-xl leading-10" : "text-base leading-8"}`} />}
      {part !== "question" && question.media?.images.map((src) => <Image key={src} src={src} alt="题目配图" width={1024} height={768} unoptimized className="mt-5 h-auto max-h-[80vh] w-full object-contain" />)}
      {part !== "question" && question.media?.audio && <div className="mt-5"><p className="mb-2 text-sm font-semibold">听力音频</p><audio controls preload="none" src={question.media.audio} aria-label="本题听力音频" className="w-full">当前浏览器不支持音频播放。</audio></div>}
      {part !== "passage" && <RichContent text={prompt} html={question.richText} lang="ja" className={`mt-4 sm:mt-7 whitespace-pre-line ${largeText ? "text-2xl leading-10" : "text-lg leading-9 sm:text-xl sm:leading-10"}`} />}
    </>
  );
}
