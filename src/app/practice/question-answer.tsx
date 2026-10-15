import type { RefObject } from "react";
import { optionLabel, type OptionId, type PracticeQuestion } from "@/data/practice-question";
import RichContent from "@/components/rich-content";

interface QuestionAnswerProps {
  question: PracticeQuestion;
  selectedOptionId: OptionId | null;
  locked: boolean;
  revealAnswer: boolean;
  onSelect: (optionId: OptionId) => void;
  feedbackRef?: RefObject<HTMLHeadingElement | null>;
}

export default function QuestionAnswer({ question, selectedOptionId, locked, revealAnswer, onSelect, feedbackRef }: QuestionAnswerProps) {
  const isCorrect = selectedOptionId === question.correctOptionId;
  const feedback = selectedOptionId === null ? "未作答" : isCorrect ? "回答正确" : "回答错误";

  return (
    <>
      <fieldset disabled={locked} aria-describedby="answer-help">
        <legend className="sr-only">答案选项（单选）</legend>
        <div className="space-y-2 sm:space-y-3">
          {question.options.map((option) => {
            const selected = selectedOptionId === option.id;
            const correctAnswer = revealAnswer && option.id === question.correctOptionId;
            const wrongSelection = revealAnswer && selected && !correctAnswer;
            const appearance = correctAnswer ? "border-emerald-500 bg-emerald-50" : wrongSelection ? "border-rose-400 bg-rose-50" : selected ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white";

            return (
              <label key={option.id} className={`answer-option flex min-h-12 sm:min-h-16 flex-wrap items-center gap-3 rounded-xl border-2 p-3 sm:p-4 transition-colors focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 ${appearance} ${locked ? "cursor-default" : "cursor-pointer hover:border-indigo-400"}`}>
                <input type="radio" name="answer" value={option.id} checked={selected} onChange={() => { if (!locked) onSelect(option.id); }} onClick={() => { if (!locked && selected) onSelect(option.id); }} className="h-4 w-4 shrink-0 accent-indigo-600" />
                <span className="text-sm font-bold text-slate-500">{option.label ?? option.id}</span>
                <RichContent text={option.text} html={question.richText} lang="ja" className="question-text flex-1" />
                {selected && <span className="text-xs font-semibold">{revealAnswer ? "你的选择" : "已选中"}</span>}
                {correctAnswer && <span className="text-xs font-semibold text-emerald-700">正确答案</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <p aria-live="polite" aria-atomic="true" className="sr-only">{revealAnswer ? `${feedback}，答案已锁定。` : ""}</p>
      {revealAnswer && (
        <section aria-labelledby="result-title" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 ref={feedbackRef} tabIndex={-1} id="result-title" className={`scroll-mt-6 text-lg font-bold outline-none ${selectedOptionId === null ? "text-slate-600" : isCorrect ? "text-emerald-700" : "text-rose-700"}`}>{feedback}</h2>
          <p className="mt-2 text-sm text-slate-600">你的选择：{optionLabel(question, selectedOptionId)} · 正确答案：{optionLabel(question, question.correctOptionId)}</p>
          <h3 className="mt-5 font-semibold">{question.richText ? "题库解析" : "中文解析"}</h3>
          {question.explanation.map((paragraph, index) => <RichContent key={index} text={paragraph} html={question.richText} className="question-text mt-2 text-slate-700" />)}
        </section>
      )}
    </>
  );
}
