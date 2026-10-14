"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import ResponsivePanel from "@/components/responsive-panel";
import { useRouter } from "next/navigation";
import type { OptionId } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";
import PracticeConfirmDialog, { type ConfirmationAction } from "./practice-confirm-dialog";
import QuestionAnswer from "./question-answer";
import SessionResults, { type SelectedAnswers } from "./session-results";
import FavoriteButton from "@/components/favorite-button";
import QuestionBody from "@/components/question-body";
import RichContent from "@/components/rich-content";

interface PracticeExerciseProps {
  paper: PracticePaper;
  initialQuestionIndex?: number;
}

interface AnswerState {
  selectedOptionId: OptionId;
  submitted: boolean;
}

const primaryButton = "min-h-12 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
const secondaryButton = "min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40";

export default function PracticeExercise({ paper, initialQuestionIndex = 0 }: PracticeExerciseProps) {
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<Partial<Record<string, AnswerState>>>({});
  const [finished, setFinished] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [instantFeedback, setInstantFeedback] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const previousView = useRef({ questionIndex, showResults });
  const question = paper.questions[questionIndex];
  const answer = answers[question.id];
  const selectedOptionId = answer?.selectedOptionId ?? null;
  const submitted = answer?.submitted ?? false;
  const totalQuestions = paper.questions.length;
  const completedQuestions = paper.questions.filter((item) => answers[item.id]?.submitted).length;
  const percent = Math.round((completedQuestions / totalQuestions) * 100);
  const selectedAnswers = paper.questions.reduce<SelectedAnswers>((selected, item) => {
    const answer = answers[item.id];
    if (answer?.submitted) selected[item.id] = answer.selectedOptionId;
    return selected;
  }, {});
  const remainingQuestions = totalQuestions - completedQuestions;
  const firstIncompleteIndex = paper.questions.findIndex((item) => !answers[item.id]?.submitted);
  const lastQuestion = questionIndex === totalQuestions - 1;
  const hasProgress = Object.keys(answers).length > 0 && !finished;
  const previousAnswer = useRef({ id: question.id, submitted });

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = { questionIndex, showResults };
    if (previous.questionIndex === questionIndex && previous.showResults === showResults) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start" });
  }, [questionIndex, showResults]);

  useEffect(() => {
    const previous = previousAnswer.current;
    previousAnswer.current = { id: question.id, submitted };
    if (previous.id !== question.id || previous.submitted || !submitted) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "nearest" });
  }, [question.id, submitted]);

  useEffect(() => {
    if (!hasProgress) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasProgress]);

  function requestConfirmation(action: ConfirmationAction) {
    setConfirmationAction(action);
    dialogRef.current?.showModal();
  }

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    // 打开新标签页不会丢失当前页的答案，无需阻拦。
    if (!hasProgress || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    requestConfirmation("leave");
  }

  function confirmAction() {
    dialogRef.current?.close();
    if (confirmationAction === "restart") restartPaper();
    if (confirmationAction === "leave") router.push("/");
  }

  function goToQuestion(index: number) {
    if (index < 0 || index >= totalQuestions) return;
    setQuestionIndex(index);
    setShowResults(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedOptionId === null || submitted || finished) return;
    setAnswers((previous) => ({
      ...previous,
      [question.id]: { selectedOptionId, submitted: true },
    }));
  }

  function selectOption(optionId: OptionId) {
    if (submitted || finished) return;
    setAnswers((previous) => {
      // 快速连点时也只接受第一次已判定的答案，避免依赖旧渲染的 submitted 值。
      if (previous[question.id]?.submitted) return previous;
      return { ...previous, [question.id]: { selectedOptionId: optionId, submitted: instantFeedback } };
    });
  }

  function finishPaper() {
    if (completedQuestions !== totalQuestions) return;
    setFinished(true);
    setShowResults(true);
  }

  function restartPaper() {
    setAnswers({});
    setQuestionIndex(0);
    setFinished(false);
    setShowResults(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 font-sans text-slate-900 sm:px-8 sm:py-6">
      <div className="session-layout">
        <header className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/" onClick={handleHomeClick} className="font-semibold text-indigo-600 hover:underline">← 首页 / 选择练习</Link>
            <span className="text-slate-500">JLPT Practice · {paper.periodLabel ?? `${paper.year} 原创版`}</span>
          </div>
          <p className="hidden lg:block mb-4 text-sm text-slate-500">{paper.sourceLabel ?? "原创模拟题库"} · 练习模式 · {paper.typeLabel} · {instantFeedback ? "点击选项即判定并锁定答案" : "手动提交后显示解析并锁定答案"}</p>
          {Boolean(paper.excludedCount) && <p className="hidden lg:block mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">该场次当前有 {paper.excludedCount} 题缺少配套资源或数据不完整，未计入本次可作答题目；详见题库导入报告。</p>}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-indigo-600 px-3 py-1 text-sm font-bold text-white">{paper.level}</span>
              <span className="rounded-lg bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">{showResults ? "练习结果" : question.category}</span>
            </div>
            <p className="text-sm font-medium text-slate-600">{showResults ? `已完成 ${totalQuestions} 题` : `第 ${questionIndex + 1} 题 / 共 ${totalQuestions} 题`}</p>
          </div>
          <div className="mt-5 flex justify-between text-sm text-slate-600">
            <label htmlFor="answer-progress">答题进度</label>
            <span>{completedQuestions} / {totalQuestions} · {percent}%</span>
          </div>
          <progress
            id="answer-progress"
            value={completedQuestions}
            max={totalQuestions}
            className="mt-2 block h-2 w-full overflow-hidden rounded-full border-0 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-indigo-600 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-indigo-600"
          />
        </header>

        <ResponsivePanel title="题目导航与设置" trigger={`题号与设置 · 已提交 ${completedQuestions}/${totalQuestions}`} >
           <nav aria-label="题目导航" className="question-grid">
            {paper.questions.map((item, index) => {
              const itemAnswer = answers[item.id];
              const correct = itemAnswer?.selectedOptionId === item.correctOptionId;
              const status = itemAnswer?.submitted ? correct ? "回答正确" : "回答错误" : itemAnswer ? "已选择，未提交" : "未作答";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goToQuestion(index)}
                  aria-current={index === questionIndex ? "step" : undefined}
                  aria-label={`第 ${index + 1} 题，${status}`}
                  className={`question-number ${index === questionIndex ? "question-current" : ""} ${itemAnswer?.submitted ? correct ? "question-correct" : "question-incorrect" : itemAnswer ? "question-draft" : "question-empty"}`}
                >{index + 1}</button>
              );
            })}
          </nav>
          <p className="mb-5 text-xs leading-6 text-slate-500">绿色为答对，红色为答错，浅黄为待提交。描边表示当前题目。</p>

        <fieldset className="mt-6 border-t border-slate-100 pt-5">
          <legend className="px-1 text-sm font-semibold text-slate-700">练习设置</legend>
          <div className="grid gap-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6">
              <input type="checkbox" name="instant-feedback" checked={instantFeedback} disabled={finished} onChange={(event) => setInstantFeedback(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600 disabled:cursor-not-allowed" />
              <span><span className="block font-semibold">点击选项即显示答案</span></span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6">
              <input type="checkbox" name="large-text" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600" />
              <span><span className="block font-semibold">大字号阅读</span></span>
            </label>
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">设置仅对本次练习生效，已提交答案保持锁定。</p>
        </fieldset>
        <p className="mt-4 text-xs leading-6 text-slate-500">{paper.sourceLabel} · {paper.periodLabel} · {paper.typeLabel}。刷新或离开会重置本次答题记录。{Boolean(paper.excludedCount) && ` ${paper.excludedCount} 题因资源缺失未计入本次练习。`}</p>
        <div className="mt-4 flex flex-wrap gap-2">{finished ? <button type="button" onClick={() => setShowResults(true)} className={secondaryButton}>成绩汇总</button> : remainingQuestions === 0 ? <button type="button" onClick={finishPaper} className={primaryButton}>完成并交卷</button> : <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={secondaryButton}>继续未完成题（{remainingQuestions}）</button>}</div>
        {question.instruction && <div className="mt-4 lg:hidden"><h3 className="text-sm font-semibold">题型说明</h3><RichContent text={question.instruction} html={question.richText} lang="ja" className="mt-2 text-sm leading-7 text-slate-600" /></div>}
</ResponsivePanel>
        <div className="session-content">
        {showResults ? (
          <SessionResults paper={paper} answers={selectedAnswers} headingRef={headingRef} onReview={goToQuestion} onRestart={() => requestConfirmation("restart")} />
        ) : (
          <>
        <section aria-labelledby="question-title" className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 ref={headingRef} tabIndex={-1} id="question-title" className="pr-12 scroll-mt-6 text-xl font-bold outline-none sm:text-2xl">第 {questionIndex + 1} 题 · {question.category}{question.sourceQuestionNumber != null && ` · 原题号 ${question.sourceQuestionNumber}`}</h1>
          <p id="answer-help" className="sr-only lg:not-sr-only mt-2 text-sm leading-6 text-slate-500">{finished ? "解析回顾：本次练习已交卷，答案不可修改。" : submitted ? "本题已提交，答案已锁定。查看解析后可继续作答或交卷。" : instantFeedback ? "点击选项立即显示答案和解析，并锁定本题；已有草稿可再次点击已选项进行判定。" : selectedOptionId === null ? "选择一个答案后才能提交；也可使用题号导航，稍后作答。" : "已选择但尚未提交，可以修改。切题会保留选择，不会自动提交。"}</p>
          <FavoriteButton key={`favorite-${question.id}`} questionId={question.id} />
          <QuestionBody question={question} largeText={largeText} compact />

          <form key={`answer-${question.id}`} onSubmit={handleSubmit} className="mt-7">
            <QuestionAnswer question={question} selectedOptionId={selectedOptionId} locked={submitted || finished} revealAnswer={submitted} onSelect={selectOption} feedbackRef={resultRef} largeText={largeText} />

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => goToQuestion(questionIndex - 1)} disabled={questionIndex === 0} className={secondaryButton}>← 上一题</button>
              {!submitted && !finished ? (
                <>
              {!instantFeedback && <button
                type="submit"
                disabled={selectedOptionId === null || submitted || finished}
                className={`${primaryButton} flex-1`}
              >
                提交答案
              </button>}
              {instantFeedback && <p className="flex-1 self-center text-sm text-slate-500">点击选项即可查看解析</p>}
              {!lastQuestion && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={secondaryButton}>暂时跳过 →</button>}
              </>
              ) : !lastQuestion ? (
                <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={`${primaryButton} flex-1`}>下一题 →</button>
              ) : finished ? (
                <button type="button" onClick={() => setShowResults(true)} className={`${primaryButton} flex-1`}>返回成绩汇总</button>
              ) : remainingQuestions > 0 ? (
                <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={`${primaryButton} flex-1`}>继续未完成题（{remainingQuestions}）</button>
              ) : (
                <button type="button" onClick={finishPaper} className={`${primaryButton} flex-1`}>完成并交卷</button>
              )}
            </div>
          </form>
        </section>
        <div className="mt-5 hidden lg:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-500">{finished ? "本次练习已完成，可切题回顾解析。" : remainingQuestions === 0 ? "所有题目已提交，可以交卷查看成绩汇总。" : `还有 ${remainingQuestions} 题未提交。已选择的题目提交后才计入进度。`}</p>
          {!lastQuestion && (finished ? <button type="button" onClick={() => setShowResults(true)} className={secondaryButton}>返回成绩汇总</button> : remainingQuestions === 0 ? <button type="button" onClick={finishPaper} className={primaryButton}>完成并交卷</button> : submitted && firstIncompleteIndex !== questionIndex ? <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={secondaryButton}>继续未完成题（{remainingQuestions}）</button> : null)}
        </div>
        </>
        )}
        </div>
        <p className="hidden lg:col-span-2 lg:block mt-5 text-center text-xs leading-6 text-slate-500">
          {paper.level} · {paper.periodLabel ?? `${paper.year} 原创版`} · {paper.sourceLabel ?? "原创模拟题库"} · {paper.typeLabel}。{paper.source === "imported" ? "内容按用户提供资源导入，不代表官方授权或官方评分。" : "精简原创文字模拟练习，不含听力。"}刷新或离开页面会重置本次答题记录。
        </p>
      </div>
      <PracticeConfirmDialog dialogRef={dialogRef} action={confirmationAction} onConfirm={confirmAction} onClose={() => setConfirmationAction(null)} />
    </main>
  );
}
