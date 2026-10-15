import Image from "next/image";
import type { PracticeQuestion } from "@/data/practice-question";
import RichContent from "./rich-content";
import ListeningPlayer from "./listening-player";

export default function QuestionBody({ question, part = "all" }: { question: PracticeQuestion; part?: "all" | "passage" | "question" }) {
  const prompt = part === "question" && question.passage?.trim() === question.prompt.trim()
    ? question.category === "语法" ? `请选择文章中${question.sourceQuestionNumber != null ? `第 ${question.sourceQuestionNumber} 空` : "当前空格"}的答案。` : "请根据上方文章选择答案。"
    : question.prompt;
  return (
    <>
      {part !== "question" && question.instruction && <RichContent text={question.instruction} html={question.richText} lang="ja" className="question-instruction mt-5 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-indigo-900" />}
      {part !== "question" && question.passage && <RichContent text={question.passage} html={question.richText} lang="ja" className={`question-text question-passage mt-6 ${part === "passage" && question.richText ? "whitespace-normal" : "whitespace-pre-line"} rounded-xl bg-slate-50 p-4 sm:p-5`} />}
      {part !== "question" && question.media?.images.map((src) => <Image key={src} src={src} alt="题目配图" width={1024} height={768} unoptimized className="mt-5 h-auto max-h-[80vh] w-full object-contain" />)}
      {part !== "question" && question.media?.audio && <ListeningPlayer reference={question.media.audio} questionId={question.id} />}
      {part !== "passage" && <RichContent text={prompt} html={question.richText} lang="ja" className="question-text mt-4 sm:mt-7 whitespace-pre-line" />}
    </>
  );
}
