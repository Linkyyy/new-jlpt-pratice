"use client";

import Link from "next/link";
import QuestionOverview from "./question-overview";
import ResponsivePanel from "@/components/responsive-panel";
import FloatingSettings from "@/components/floating-settings";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { OptionId } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";
import { formatDuration, getExamDuration } from "@/data/practice-modes";
import PracticeConfirmDialog, { type ConfirmationAction } from "./practice-confirm-dialog";
import QuestionAnswer from "./question-answer";
import ReadingWorkspace from "./reading-workspace";
import { usesArticleDrawer } from "./article-questions";
import ReviewToolbar from "./review-toolbar";
import NavigationSettings from "./navigation-settings";
import FontSizeSetting from "./font-size-setting";
import { useQuestionSwipe } from "./use-question-swipe";
import SessionResults, { type SelectedAnswers } from "./session-results";
import { useExamTimer } from "./use-exam-timer";
import FavoriteButton from "@/components/favorite-button";
import QuestionBody from "@/components/question-body";

type ExamPhase = "ready" | "running" | "finished";

const primaryButton = "min-h-12 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600";
const secondaryButton = "min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40";

export default function ExamSession({ paper }: { paper: PracticePaper }) {
  const [fontSize, setFontSize] = useState(18);
  const router = useRouter();
  const [phase, setPhase] = useState<ExamPhase>("ready");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<SelectedAnswers>({});
  const [showResults, setShowResults] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [buttonsEnabled, setButtonsEnabled] = useState(true);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finishedRef = useRef(false);
  const previousView = useRef({ phase, questionIndex, showResults });
  const durationSeconds = getExamDuration(paper.questions.length);
  const timer = useExamTimer(durationSeconds, () => finishExam(true));
  const question = paper.questions[questionIndex];
  const article = usesArticleDrawer(question);
  const selectedOptionId = answers[question.id] ?? null;
  const answeredCount = paper.questions.filter((item) => answers[item.id] !== undefined).length;
  const unansweredCount = paper.questions.length - answeredCount;
  const nextUnansweredIndex = paper.questions.findIndex((item, index) => index !== questionIndex && answers[item.id] === undefined);
  const finished = phase === "finished";
  const lastQuestion = questionIndex === paper.questions.length - 1;

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = { phase, questionIndex, showResults };
    if (previous.phase === phase && previous.questionIndex === questionIndex && previous.showResults === showResults) return;
    if (!headingRef.current?.closest("[hidden]")) headingRef.current?.focus({ preventScroll: true });
    if (showResults || !article) headingRef.current?.scrollIntoView({ block: "start" });
  }, [phase, questionIndex, showResults, article]);

  useEffect(() => {
    if (phase !== "running") return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [phase]);

  function startExam() {
    finishedRef.current = false;
    timer.start();
    setPhase("running");
  }

  function finishExam(expired: boolean) {
    if (phase !== "running" || finishedRef.current) return;
    finishedRef.current = true;
    setElapsedSeconds(timer.stop());
    setTimedOut(expired);
    dialogRef.current?.close();
    setPhase("finished");
    setShowResults(true);
  }

  function checkDeadline(): boolean {
    if (phase !== "running") return false;
    if (timer.deadline !== null && Date.now() >= timer.deadline) {
      finishExam(true);
      return true;
    }
    return false;
  }

  function selectOption(optionId: OptionId) {
    if (phase !== "running" || finishedRef.current || checkDeadline()) return;
    setAnswers((previous) => ({ ...previous, [question.id]: optionId }));
  }

  function goToQuestion(index: number) {
    if (index < 0 || index >= paper.questions.length || checkDeadline()) return;
    setQuestionIndex(index);
    setShowResults(false);
  }

  function requestConfirmation(action: ConfirmationAction) {
    if (checkDeadline()) return;
    setConfirmationAction(action);
    dialogRef.current?.showModal();
  }

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    if (phase !== "running" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    requestConfirmation("leave");
  }

  function confirmAction() {
    if (checkDeadline()) return;
    dialogRef.current?.close();
    if (confirmationAction === "submit") finishExam(false);
    if (confirmationAction === "leave") router.push("/");
    if (confirmationAction === "restart") {
      timer.reset();
      finishedRef.current = false;
      setAnswers({});
      setQuestionIndex(0);
      setShowResults(false);
      setTimedOut(false);
      setElapsedSeconds(0);
      setPhase("ready");
    }
  }

  const swipe = useQuestionSwipe((direction) => goToQuestion(questionIndex + direction), swipeEnabled);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 font-sans text-slate-900 sm:px-8 sm:py-6">
      <div className="session-layout" style={{ "--practice-font-size": `${fontSize}px` } as CSSProperties}>
        <header className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/" onClick={handleHomeClick} className="font-semibold text-indigo-600 hover:underline">← 首页 / 选择练习</Link>
            <span className="text-slate-500">JLPT Practice · {paper.periodLabel ?? `${paper.year} 原创版`}</span>
          </div>
          <p className="mb-4 text-sm text-slate-500">{paper.sourceLabel ?? "原创模拟题库"} · {finished ? "复习模式" : "考试模式"} · {paper.level} · {paper.typeLabel}</p>
          {Boolean(paper.excludedCount) && <p className="hidden lg:block mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">{paper.excludedCount} 题因配套资源缺失或数据不完整未计入当前试卷，本次只评估可作答题目。</p>}

        </header>

        {finished && !showResults && <ReviewToolbar onReturn={() => setShowResults(true)} />}
        {phase === "running" && <div className="session-timer sticky top-0 z-10 mb-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <p className={`text-sm font-semibold ${timer.remainingSeconds <= 60 ? "text-rose-700" : "text-slate-700"}`}>剩余时间 <span role="timer" aria-live="off" data-remaining-seconds={timer.remainingSeconds} className="ml-1 font-mono text-lg tabular-nums">{formatDuration(timer.remainingSeconds)}</span></p>
          <button type="button" onClick={() => requestConfirmation("submit")} className={primaryButton}>交卷</button>
        </div>}

        {phase === "ready" ? (
          <section className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="exam-ready-title">
            <h1 ref={headingRef} tabIndex={-1} id="exam-ready-title" className="scroll-mt-6 text-2xl font-bold outline-none">准备开始考试</h1>
            <p className="mt-4 text-slate-600">{paper.level} · {paper.periodLabel ?? `${paper.year} 原创版`} · {paper.typeLabel} · 共 {paper.questions.length} 题</p>
            <p className="mt-3 text-lg font-semibold text-indigo-700">训练时长：{durationSeconds / 60} 分钟</p>
            <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-600">
              <li>点击“开始考试”才开始计时；当前尚未计时。</li>
              <li>选项会记录在本次页面中，可自由切题并修改，交卷前不显示答案和解析。</li>
              <li>计时不会因切题、确认弹窗或切到后台而暂停。时间到后自动交卷。</li>
              <li>提前交卷需要确认；未作答题目不计分，交卷后不可修改答案。</li>
              <li>刷新或离开页面会丢失答案和计时进度，目前不支持断点续考。</li>
            </ul>
            <p className="mt-5 text-xs leading-6 text-slate-500">{paper.source === "imported" ? "本卷来自用户提供题库；未接入的媒体题不计入本次作答。" : "这是原创精简文字卷，不含听力。"}训练时长、题量和评分均不等同于正式 JLPT 考试。</p>
            <button type="button" onClick={startExam} className={`${primaryButton} mt-6 w-full sm:w-auto`}>开始考试</button>
          </section>
        ) : showResults ? (
          <div className="lg:col-span-2"><SessionResults paper={paper} answers={answers} headingRef={headingRef} onReview={goToQuestion} onRestart={() => requestConfirmation("restart")} exam={{ elapsedSeconds, timedOut }} /></div>
        ) : (
          <>
            <ResponsivePanel title="答题卡" className="answer-card-panel" trigger={`答题卡 · 已作答 ${answeredCount}/${paper.questions.length}`} headerAction={
              <FloatingSettings title={finished ? "复习设置" : "考试设置"}>
            <FontSizeSetting value={fontSize} onChange={setFontSize} />
            <NavigationSettings swipeEnabled={swipeEnabled} buttonsEnabled={buttonsEnabled} onSwipeChange={setSwipeEnabled} onButtonsChange={setButtonsEnabled} />
        <p className="mt-4 text-xs leading-6 text-slate-500">{paper.sourceLabel} · {paper.periodLabel}。{Boolean(paper.excludedCount) && `${paper.excludedCount} 题因资源缺失未计入本次考试。`}</p>
              </FloatingSettings>
            }>
            <QuestionOverview questions={paper.questions} currentIndex={questionIndex} onSelect={goToQuestion} getStatus={(item) => answers[item.id] !== undefined ? finished ? answers[item.id] === item.correctOptionId ? "correct" : "incorrect" : "answered" : "empty"} />

</ResponsivePanel>
            <div className="session-content">
        <ReadingWorkspace question={question} questions={paper.questions} questionIndex={questionIndex} reviewing={finished} onNavigate={goToQuestion} getStatus={(item) => answers[item.id] !== undefined ? finished ? answers[item.id] === item.correctOptionId ? "correct" : "incorrect" : "answered" : "empty"}>
            <section {...swipe} aria-labelledby="question-title" className="question-card relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <h1 ref={headingRef} tabIndex={-1} id="question-title" className="pr-12 scroll-mt-24 text-xl font-bold outline-none sm:text-2xl">第 {questionIndex + 1} 题 · {question.category}{question.sourceQuestionNumber != null && ` · 原题号 ${question.sourceQuestionNumber}`}</h1>
              <p id="answer-help" className="sr-only">{finished ? "考后回顾：可查看正确答案和解析，不能修改答案。" : "考试模式：交卷前不显示正误或解析。选项可修改，也可先跳题。"}</p>
              <FavoriteButton key={`favorite-${question.id}`} questionId={question.id} />
              <QuestionBody question={question} part={article ? "question" : "all"} />
              <div key={`answer-${question.id}`} className="mt-7"><QuestionAnswer question={question} selectedOptionId={selectedOptionId} locked={finished} revealAnswer={finished} onSelect={selectOption} /></div>
              <div className="answer-actions mt-5">
                {buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex - 1)} disabled={questionIndex === 0} className={secondaryButton}>← 上一题</button>}
                {!lastQuestion ? buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={`${primaryButton} flex-1`}>下一题 →</button> : finished ? <button type="button" onClick={() => setShowResults(true)} className={`${primaryButton} flex-1`}>返回结算</button> : <button type="button" onClick={() => requestConfirmation("submit")} className={`${primaryButton} flex-1`}>交卷</button>}
              </div>
            </section>
        </ReadingWorkspace>
            <div className="mt-5 hidden lg:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-500">{finished ? "已交卷，可查看每道题的答案和解析。" : `已作答 ${answeredCount} 题，未作答 ${unansweredCount} 题。`}</p>
              {finished ? !lastQuestion && <button type="button" onClick={() => setShowResults(true)} className={secondaryButton}>返回结算</button> : buttonsEnabled && nextUnansweredIndex >= 0 && <button type="button" onClick={() => goToQuestion(nextUnansweredIndex)} className={secondaryButton}>定位未作答题</button>}
            </div>
            </div>
          </>
        )}
        <footer className="session-progress" aria-label="考试进度">
          {phase !== "ready" && <>
            <div className="flex justify-between gap-3 text-sm text-slate-600">
              <label htmlFor="exam-progress">已作答 {answeredCount} / {paper.questions.length} 题</label>
              <span>{showResults ? "已交卷" : `第 ${questionIndex + 1} 题 / 共 ${paper.questions.length} 题`}</span>
            </div>
            <progress id="exam-progress" value={answeredCount} max={paper.questions.length} className="mt-2 block h-2 w-full overflow-hidden rounded-full border-0 [&::-moz-progress-bar]:bg-indigo-600 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-600" />
          </>}
        </footer>
      </div>
      <PracticeConfirmDialog dialogRef={dialogRef} action={confirmationAction} onConfirm={confirmAction} onClose={() => setConfirmationAction(null)} sessionLabel="考试" unansweredCount={unansweredCount} />
    </main>
  );
}
