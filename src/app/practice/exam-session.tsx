"use client";

import { useI18n } from "@/lib/i18n";
import { translatePeriod } from "@/lib/i18n/translate";

import Link from "next/link";
import QuestionOverview from "./question-overview";
import ResponsivePanel from "@/components/responsive-panel";
import FloatingSettings from "@/components/floating-settings";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
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
import { useQuestionKeyboard } from "./use-question-keyboard";
import QuestionFeedback from "@/components/question-feedback";
import SessionResults, { type SelectedAnswers } from "./session-results";
import { useExamTimer } from "./use-exam-timer";
import FavoriteButton from "@/components/favorite-button";
import QuestionBody from "@/components/question-body";
import type { StudyAttempt } from "@/lib/study-store";
import { useStudyPersistence } from "./use-study-persistence";
import { useQuestionFontSize } from "./use-question-font-size";
import { isRandomPeriod, questionPeriod } from "@/data/random-practice";
import { formatPeriod } from "@/data/bank-catalog";

type ExamPhase = "ready" | "running" | "finished";

const primaryButton = "min-h-12 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600";
const secondaryButton = "min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40";

export default function ExamSession({ paper, attempt, initialSaveError, initialQuestionIndex = 0, onRestart }: { paper: PracticePaper; attempt: StudyAttempt; initialSaveError: string | null; initialQuestionIndex?: number; onRestart: () => void }) {
  const { t } = useI18n();
  const { fontSize, setFontSize, savedFontSizes } = useQuestionFontSize(attempt);
  const router = useRouter();
  const [phase, setPhase] = useState<ExamPhase>(attempt.status === "completed" ? "finished" : attempt.status === "active" ? "running" : "ready");
  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<SelectedAnswers>(() => Object.fromEntries(Object.entries(attempt.answers).filter(([, a]) => a).map(([id, a]) => [id, a!.selectedOptionId])));
  const [showResults, setShowResults] = useState(attempt.status === "completed");
  const [timedOut, setTimedOut] = useState(attempt.timedOut);
  const [elapsedSeconds, setElapsedSeconds] = useState(attempt.elapsedSeconds);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [buttonsEnabled, setButtonsEnabled] = useState(true);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const finishedRef = useRef(attempt.status === "completed");
  const previousView = useRef({ phase, questionIndex, showResults });
  const durationSeconds = getExamDuration(paper.questions.length);
  const timer = useExamTimer(durationSeconds, () => finishExam(true), attempt.deadline);
  const question = paper.questions[questionIndex];
  const article = usesArticleDrawer(question, paper.questions);
  const selectedOptionId = answers[question.id] ?? null;
  const answeredCount = paper.questions.filter((item) => answers[item.id] !== undefined).length;
  const unansweredCount = paper.questions.length - answeredCount;
  const nextUnansweredIndex = paper.questions.findIndex((item, index) => index !== questionIndex && answers[item.id] === undefined);
  const finished = phase === "finished";
  const lastQuestion = questionIndex === paper.questions.length - 1;
  const savedAnswers = useMemo(() => Object.fromEntries(Object.entries(answers).filter(([, id]) => id).map(([id, selectedOptionId]) => [id, { selectedOptionId: selectedOptionId!, submitted: finished }])), [answers, finished]);
  const saveError = useStudyPersistence(attempt, { answers: savedAnswers, status: finished ? "completed" : phase === "ready" ? "ready" : "active", questionIndex, deadline: phase === "running" ? timer.deadline : null, elapsedSeconds, timedOut, ...savedFontSizes }, initialSaveError);

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = { phase, questionIndex, showResults };
    if (previous.phase === phase && previous.questionIndex === questionIndex && previous.showResults === showResults) return;
    if (!headingRef.current?.closest("[hidden]")) headingRef.current?.focus({ preventScroll: true });
    if (showResults || !article) headingRef.current?.scrollIntoView({ block: "start" });
  }, [phase, questionIndex, showResults, article]);

  useEffect(() => {
    if (phase !== "running" || !saveError) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [phase, saveError]);

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
      onRestart();
    }
  }

  useQuestionKeyboard({
    enabled: keyboardEnabled && phase !== "ready" && !showResults,
    anchorRef: headingRef,
    onSelect: (index) => { const option = question.options[index]; if (option) selectOption(option.id); },
    onAdvance: () => {
      if (finished && lastQuestion) setShowResults(true);
      else if (!lastQuestion) goToQuestion(questionIndex + 1);
      else requestConfirmation("submit");
    },
    onNavigate: (direction) => goToQuestion(questionIndex + direction),
  });

  const swipe = useQuestionSwipe((direction) => goToQuestion(questionIndex + direction), swipeEnabled);

  return (
    <main className="session-page min-h-screen bg-slate-50 px-4 py-4 font-sans text-slate-900 sm:px-8 sm:py-6">
      <div className="session-layout" style={{ "--practice-font-size": `${fontSize}px` } as CSSProperties}>
        <header className="session-header mb-6">
          {saveError && <p role="alert" className="session-save-error mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t(saveError)} {t("当前作答尚未保存，请勿关闭页面。")}</p>}
          <div className="session-topline mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/" onClick={handleHomeClick} className="font-semibold text-indigo-600 hover:underline">{t("← 首页 / 选择练习")}</Link>
            <span className="text-slate-500">JLPT Practice · {translatePeriod(paper.periodLabel ?? `${paper.year} 原创版`, paper.source, t)}</span>
          </div>
          <p className="mb-4 text-sm text-slate-500">{t(paper.sourceLabel ?? "原创模拟题库")} · {t(finished ? "复习模式" : "考试模式")} · {t(paper.level)} · {t(paper.typeLabel)}</p>
          {Boolean(paper.excludedCount) && <p className="hidden lg:block mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">{paper.excludedCount} {t("题因配套资源缺失或数据不完整未计入当前试卷，本次只评估可作答题目。")}</p>}

        </header>

        {finished && !showResults && <ReviewToolbar onReturn={() => setShowResults(true)} />}
        {phase === "running" && <div className="session-timer sticky top-0 z-10 mb-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <p className={`text-sm font-semibold ${timer.remainingSeconds <= 60 ? "text-rose-700" : "text-slate-700"}`}>{t("剩余时间")}<span role="timer" aria-live="off" data-remaining-seconds={timer.remainingSeconds} className="ml-1 font-mono text-lg tabular-nums">{formatDuration(timer.remainingSeconds)}</span></p>
          <button type="button" onClick={() => requestConfirmation("submit")} className={primaryButton}>{t("交卷")}</button>
        </div>}

        {phase === "ready" ? (
          <section className="session-content exam-ready lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="exam-ready-title">
            <h1 ref={headingRef} tabIndex={-1} id="exam-ready-title" className="scroll-mt-6 text-2xl font-bold outline-none">{t("准备开始考试")}</h1>
            <p className="mt-4 text-slate-600">{t(paper.level)} · {translatePeriod(paper.periodLabel ?? `${paper.year} 原创版`, paper.source, t)} · {t(paper.typeLabel)} {t("· 共")}{paper.questions.length} {t("题")}</p>
            <p className="mt-3 text-lg font-semibold text-indigo-700">{t("训练时长：")}{durationSeconds / 60} {t("分钟")}</p>
            <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-600">
              <li>{t("点击“开始考试”才开始计时；当前尚未计时。")}</li>
              <li>{t("选项自动保存在当前浏览器，可自由切题并修改，交卷前不显示答案和解析。")}</li>
              <li>{t("计时不会因切题、确认弹窗或切到后台而暂停。时间到后自动交卷。")}</li>
              <li>{t("提前交卷需要确认；未作答题目不计分，交卷后不可修改答案。")}</li>
              <li>{t("刷新或离开后可从首页续考，考试仍按原截止时间计时；到期恢复时自动交卷。")}</li>
            </ul>
            <p className="mt-5 text-xs leading-6 text-slate-500">{t(paper.source === "imported" ? "本卷来自用户提供题库；未接入的媒体题不计入本次作答。" : "这是原创精简文字卷，不含听力。")}{t("训练时长、题量和评分均不等同于正式 JLPT 考试。")}</p>
            <button type="button" onClick={startExam} className={`${primaryButton} mt-6 w-full sm:w-auto`}>{t("开始考试")}</button>
          </section>
        ) : showResults ? (
          <div className="session-content exam-results lg:col-span-2"><SessionResults paper={paper} answers={answers} headingRef={headingRef} onReview={goToQuestion} onRestart={() => requestConfirmation("restart")} exam={{ elapsedSeconds, timedOut }} /></div>
        ) : (
          <>
            <ResponsivePanel title={t("答题卡")} className="answer-card-panel" trigger={t(`答题卡 · 已作答 ${answeredCount}/${paper.questions.length}`)} headerAction={
              <FloatingSettings title={t(finished ? "复习设置" : "考试设置")}>
            <FontSizeSetting value={fontSize} onChange={setFontSize} />
            <NavigationSettings swipeEnabled={swipeEnabled} buttonsEnabled={buttonsEnabled} keyboardEnabled={keyboardEnabled} onSwipeChange={setSwipeEnabled} onButtonsChange={setButtonsEnabled} onKeyboardChange={setKeyboardEnabled} />
        <p className="mt-4 text-xs leading-6 text-slate-500">{t(paper.sourceLabel)} · {translatePeriod(paper.periodLabel ?? paper.year, paper.source, t)}。{t(Boolean(paper.excludedCount) && `${paper.excludedCount} 题因资源缺失未计入本次考试。`)}</p>
            <QuestionFeedback question={question} paper={paper} />
              </FloatingSettings>
            }>
            <QuestionOverview questions={paper.questions} currentIndex={questionIndex} onSelect={goToQuestion} getStatus={(item) => answers[item.id] !== undefined ? finished ? answers[item.id] === item.correctOptionId ? "correct" : "incorrect" : "answered" : "empty"} />

</ResponsivePanel>
            <div className="session-content">
        <ReadingWorkspace question={question} questions={paper.questions} questionIndex={questionIndex} reviewing={finished} onNavigate={goToQuestion} getStatus={(item) => answers[item.id] !== undefined ? finished ? answers[item.id] === item.correctOptionId ? "correct" : "incorrect" : "answered" : "empty"}>
            <section {...swipe} aria-labelledby="question-title" className="question-card relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <h1 ref={headingRef} tabIndex={-1} id="question-title" className="pr-12 scroll-mt-24 text-xl font-bold outline-none sm:text-2xl">{t("第 {0} 题 · {1}", { 0: questionIndex + 1, 1: t(question.category) })}{question.sourceQuestionNumber != null && t(" · 原题号 {0}", { 0: question.sourceQuestionNumber })}</h1>
              {isRandomPeriod(paper.year) && questionPeriod(question) && <p className="mt-1 text-xs leading-5 text-slate-500">{t("题目来源：{0}", { 0: t(formatPeriod(questionPeriod(question)!)) })}</p>}
              <p id="answer-help" className="sr-only">{t(finished ? "考后回顾：可查看正确答案和解析，不能修改答案。" : "考试模式：交卷前不显示正误或解析。选项可修改，也可先跳题。")}</p>
              <FavoriteButton key={`favorite-${question.id}`} questionId={question.id} />
              <QuestionBody question={question} part={article ? "question" : "all"} />
              <div key={`answer-${question.id}`} className="mt-7"><QuestionAnswer question={question} selectedOptionId={selectedOptionId} locked={finished} revealAnswer={finished} onSelect={selectOption} /></div>
              <div className="answer-actions mt-5">
                {buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex - 1)} disabled={questionIndex === 0} className={secondaryButton}>{t("← 上一题")}</button>}
                {!lastQuestion ? buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={`${primaryButton} flex-1`}>{t("下一题 →")}</button> : finished ? <button type="button" onClick={() => setShowResults(true)} className={`${primaryButton} flex-1`}>{t("返回结算")}</button> : <button type="button" onClick={() => requestConfirmation("submit")} className={`${primaryButton} flex-1`}>{t("交卷")}</button>}
              </div>
            </section>
        </ReadingWorkspace>
            <div className="mt-5 hidden lg:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-slate-500">{t(finished ? "已交卷，可查看每道题的答案和解析。" : `已作答 ${answeredCount} 题，未作答 ${unansweredCount} 题。`)}</p>
              {finished ? !lastQuestion && <button type="button" onClick={() => setShowResults(true)} className={secondaryButton}>{t("返回结算")}</button> : buttonsEnabled && nextUnansweredIndex >= 0 && <button type="button" onClick={() => goToQuestion(nextUnansweredIndex)} className={secondaryButton}>{t("定位未作答题")}</button>}
            </div>
            </div>
          </>
        )}
        <footer className="session-progress" aria-label={t("考试进度")}>
          {phase !== "ready" && <>
            <div className="flex justify-between gap-3 text-sm text-slate-600">
              <label htmlFor="exam-progress">{t("已作答")}{answeredCount} / {paper.questions.length} {t("题")}</label>
              <span>{t(showResults ? "已交卷" : `第 ${questionIndex + 1} 题 / 共 ${paper.questions.length} 题`)}</span>
            </div>
            <progress id="exam-progress" value={answeredCount} max={paper.questions.length} className="mt-2 block h-2 w-full overflow-hidden rounded-full border-0 [&::-moz-progress-bar]:bg-indigo-600 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-indigo-600" />
          </>}
        </footer>
      </div>
      <PracticeConfirmDialog dialogRef={dialogRef} action={confirmationAction} onConfirm={confirmAction} onClose={() => setConfirmationAction(null)} sessionLabel="考试" unansweredCount={unansweredCount} progressSaved={!saveError} />
    </main>
  );
}
