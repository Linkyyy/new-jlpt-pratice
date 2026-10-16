"use client";

import { useI18n } from "@/lib/i18n";
import { translatePeriod } from "@/lib/i18n/translate";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import QuestionOverview from "./question-overview";
import Link from "next/link";
import ResponsivePanel from "@/components/responsive-panel";
import FloatingSettings from "@/components/floating-settings";
import { useRouter } from "next/navigation";
import type { OptionId } from "@/data/practice-question";
import type { PracticePaper } from "@/data/practice-papers";
import PracticeConfirmDialog, { type ConfirmationAction } from "./practice-confirm-dialog";
import QuestionAnswer from "./question-answer";
import ReadingWorkspace from "./reading-workspace";
import { articleGroup, usesArticleDrawer } from "./article-questions";
import ReviewToolbar from "./review-toolbar";
import NavigationSettings from "./navigation-settings";
import FontSizeSetting from "./font-size-setting";
import { useQuestionSwipe } from "./use-question-swipe";
import { useQuestionKeyboard } from "./use-question-keyboard";
import QuestionFeedback from "@/components/question-feedback";
import SessionResults, { type SelectedAnswers } from "./session-results";
import FavoriteButton from "@/components/favorite-button";
import QuestionBody from "@/components/question-body";
import type { StudyAttempt } from "@/lib/study-store";
import { useStudyPersistence } from "./use-study-persistence";
import { useQuestionFontSize } from "./use-question-font-size";

interface PracticeExerciseProps {
  paper: PracticePaper;
  initialQuestionIndex?: number;
  attempt: StudyAttempt;
  initialSaveError: string | null;
  onRestart: () => void;
}

interface AnswerState {
  selectedOptionId: OptionId;
  submitted: boolean;
}

const primaryButton = "min-h-12 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";
const secondaryButton = "min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40";

export default function PracticeExercise({ paper, attempt, initialSaveError, onRestart, initialQuestionIndex = 0 }: PracticeExerciseProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex);
  const [answers, setAnswers] = useState<Partial<Record<string, AnswerState>>>(attempt.answers);
  const [finished, setFinished] = useState(attempt.status === "completed");
  const [showResults, setShowResults] = useState(attempt.status === "completed");
  const [instantFeedback, setInstantFeedback] = useState(false);
  const { fontSize, setFontSize, savedFontSizes } = useQuestionFontSize(attempt);
  const [swipeEnabled, setSwipeEnabled] = useState(true);
  const [buttonsEnabled, setButtonsEnabled] = useState(true);
  const [keyboardEnabled, setKeyboardEnabled] = useState(true);
  const [confirmationAction, setConfirmationAction] = useState<ConfirmationAction | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const previousView = useRef({ questionIndex, showResults });
  const question = paper.questions[questionIndex];
  const article = usesArticleDrawer(question, paper.questions);
  const group = articleGroup(paper.questions, question);
  const groupComplete = group.every(({ item }) => answers[item.id] !== undefined);
  const firstGroupDraft = group.find(({ item }) => answers[item.id] === undefined);
  const nextArticleIndex = Math.max(...group.map(({ index }) => index)) + 1;
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
  const saveError = useStudyPersistence(attempt, { answers, status: finished ? "completed" : "active", questionIndex, deadline: null, elapsedSeconds: 0, timedOut: false, ...savedFontSizes }, initialSaveError);

  useEffect(() => {
    const previous = previousView.current;
    previousView.current = { questionIndex, showResults };
    if (previous.questionIndex === questionIndex && previous.showResults === showResults) return;
    if (!headingRef.current?.closest("[hidden]")) headingRef.current?.focus({ preventScroll: true });
    if (showResults || !article) headingRef.current?.scrollIntoView({ block: "start" });
  }, [questionIndex, showResults, article]);

  useEffect(() => {
    const previous = previousAnswer.current;
    previousAnswer.current = { id: question.id, submitted };
    if (previous.id !== question.id || previous.submitted || !submitted) return;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: "nearest" });
  }, [question.id, submitted]);

  useEffect(() => {
    if (!hasProgress || !saveError) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasProgress, saveError]);

  function requestConfirmation(action: ConfirmationAction) {
    setConfirmationAction(action);
    dialogRef.current?.showModal();
  }

  function handleHomeClick(event: MouseEvent<HTMLAnchorElement>) {
    // 打开新标签页不会丢失当前页的答案，无需阻拦。
    if (!hasProgress || !saveError || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    requestConfirmation("leave");
  }

  function confirmAction() {
    dialogRef.current?.close();
    if (confirmationAction === "restart") restartPaper();
    if (confirmationAction === "leave") router.push(paper.source === "favorites" ? "/favorites" : "/");
  }

  function goToQuestion(index: number) {
    if (index < 0 || index >= totalQuestions) return;
    setQuestionIndex(index);
    setShowResults(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitAnswers();
  }

  function submitAnswers() {
    if (finished || submitted || selectedOptionId === null) return;
    if (article) {
      if (!groupComplete) return;
      setAnswers((previous) => {
        if (group.some(({ item }) => previous[item.id] === undefined)) return previous;
        const updated = { ...previous };
        for (const { item } of group) updated[item.id] = { selectedOptionId: previous[item.id]!.selectedOptionId, submitted: true };
        return updated;
      });
      return;
    }
    setAnswers((previous) => ({ ...previous, [question.id]: { selectedOptionId, submitted: true } }));
  }

  function selectOption(optionId: OptionId) {
    if (submitted || finished) return;
    setAnswers((previous) => {
      // 快速连点时也只接受第一次已判定的答案，避免依赖旧渲染的 submitted 值。
      if (previous[question.id]?.submitted) return previous;
      return { ...previous, [question.id]: { selectedOptionId: optionId, submitted: instantFeedback && !article } };
    });
  }

  function finishPaper() {
    if (completedQuestions !== totalQuestions) return;
    setFinished(true);
    setShowResults(true);
  }

  function restartPaper() {
    onRestart();
  }

  function advanceQuestion() {
    if (finished) {
      if (lastQuestion) setShowResults(true);
      else goToQuestion(questionIndex + 1);
      return;
    }
    if (article && !submitted) {
      if (groupComplete) submitAnswers();
      else if (selectedOptionId !== null && firstGroupDraft) goToQuestion(firstGroupDraft.index);
      return;
    }
    if (!submitted) {
      submitAnswers();
      return;
    }
    if (article && nextArticleIndex < totalQuestions) goToQuestion(nextArticleIndex);
    else if (!article && !lastQuestion) goToQuestion(questionIndex + 1);
    else if (remainingQuestions > 0) goToQuestion(firstIncompleteIndex);
    else finishPaper();
  }

  useQuestionKeyboard({
    enabled: keyboardEnabled && !showResults,
    anchorRef: headingRef,
    onSelect: (index) => { const option = question.options[index]; if (option) selectOption(option.id); },
    onAdvance: advanceQuestion,
    onNavigate: (direction) => goToQuestion(questionIndex + direction),
  });

  const swipe = useQuestionSwipe((direction) => goToQuestion(questionIndex + direction), swipeEnabled);

  return (
    <main className="session-page min-h-screen bg-slate-50 px-4 py-4 font-sans text-slate-900 sm:px-8 sm:py-6">
      <div className="session-layout" style={{ "--practice-font-size": `${fontSize}px` } as CSSProperties}>
        <header className="session-header mb-8">
          {saveError && <p role="alert" className="session-save-error mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t(saveError)} {t("当前作答尚未保存，请勿关闭页面。")}</p>}
          <div className="session-topline mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href={paper.source === "favorites" ? "/favorites" : "/"} onClick={handleHomeClick} className="font-semibold text-indigo-600 hover:underline">{t(paper.source === "favorites" ? "← 返回收藏题库" : "← 首页 / 选择练习")}</Link>
            <span className="text-slate-500">JLPT Practice · {translatePeriod(paper.periodLabel ?? `${paper.year} 原创版`, paper.source, t)}</span>
          </div>
          <p className="hidden lg:block mb-4 text-sm text-slate-500">{t(paper.sourceLabel ?? "原创模拟题库")} · {t(finished ? "复习模式" : "练习模式")} · {t(paper.typeLabel)} · {t(finished ? "原答案与解析" : article ? "本篇小题统一提交" : instantFeedback ? "点击选项即判定并锁定答案" : "手动提交后显示解析并锁定答案")}</p>
          {Boolean(paper.excludedCount) && <p className="hidden lg:block mb-4 rounded-lg bg-amber-50 p-3 text-xs leading-6 text-amber-900">{t("该场次当前有")}{paper.excludedCount} {t("题缺少配套资源或数据不完整，未计入本次可作答题目；详见题库导入报告。")}</p>}

        </header>

        {finished && !showResults && <ReviewToolbar onReturn={() => setShowResults(true)} />}
        <ResponsivePanel title={t("答题卡")} className="answer-card-panel" trigger={t(`答题卡 · 已提交 ${completedQuestions}/${totalQuestions}`)} headerAction={
          <FloatingSettings title={t(finished ? "复习设置" : "练习设置")}>
        <fieldset>
          <legend className="sr-only">{t("答题与显示")}</legend>
          <div className="grid gap-3">
            {!finished && <>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6">
              <input type="checkbox" name="instant-feedback" checked={instantFeedback} disabled={finished} onChange={(event) => setInstantFeedback(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-indigo-600 disabled:cursor-not-allowed" />
              <span><span className="block font-semibold">{t("点击选项即显示答案")}</span></span>
            </label>
            </>}
            <FontSizeSetting value={fontSize} onChange={setFontSize} />
          </div>
          <p className="mt-3 text-xs leading-6 text-slate-500">{t("文章题完成全部小题后统一提交，即时判定仅用于独立题。已提交答案保持锁定。")}</p>
        </fieldset>
        <NavigationSettings swipeEnabled={swipeEnabled} buttonsEnabled={buttonsEnabled} keyboardEnabled={keyboardEnabled} onSwipeChange={setSwipeEnabled} onButtonsChange={setButtonsEnabled} onKeyboardChange={setKeyboardEnabled} />
        <p className="mt-4 text-xs leading-6 text-slate-500">{t("进度自动保存在当前浏览器，可从首页继续练习。")}{t(Boolean(paper.excludedCount) && ` ${paper.excludedCount} 题因资源缺失未计入本次练习。`)}</p>
        <QuestionFeedback question={question} paper={paper} />
          </FloatingSettings>
        }>
          <QuestionOverview questions={paper.questions} currentIndex={questionIndex} onSelect={goToQuestion} getStatus={(item) => {
            const answer = answers[item.id];
            return answer?.submitted ? answer.selectedOptionId === item.correctOptionId ? "correct" : "incorrect" : answer ? "draft" : "empty";
          }} />
</ResponsivePanel>
        <div className="session-content">
        {showResults ? (
          <SessionResults paper={paper} answers={selectedAnswers} headingRef={headingRef} onReview={goToQuestion} onRestart={() => requestConfirmation("restart")} />
        ) : (
          <>
        <ReadingWorkspace question={question} questions={paper.questions} questionIndex={questionIndex} reviewing={finished} onNavigate={goToQuestion} getStatus={(item) => {
            const answer = answers[item.id];
            return answer?.submitted ? answer.selectedOptionId === item.correctOptionId ? "correct" : "incorrect" : answer ? "draft" : "empty";
          }}>
        <section {...swipe} aria-labelledby="question-title" className="question-card relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <h1 ref={headingRef} tabIndex={-1} id="question-title" className="pr-12 scroll-mt-6 text-xl font-bold outline-none sm:text-2xl">{t("第 {0} 题 · {1}", { 0: questionIndex + 1, 1: t(question.category) })}{question.sourceQuestionNumber != null && t(" · 原题号 {0}", { 0: question.sourceQuestionNumber })}</h1>
          <p id="answer-help" className="sr-only">{t(finished ? "解析回顾：本次练习已交卷，答案不可修改。" : submitted ? "本题已提交，答案已锁定。查看解析后可继续作答或交卷。" : article ? "先完成本篇所有小题，再一次提交本篇答案。切换小题会保留选择。" : instantFeedback ? "点击选项立即显示答案和解析，并锁定本题；已有草稿可再次点击已选项进行判定。" : "选择答案后提交，切题会保留选择。")}</p>
          <FavoriteButton key={`favorite-${question.id}`} questionId={question.id} />
          <QuestionBody question={question} part={article ? "question" : "all"} />

          <form key={`answer-${question.id}`} onSubmit={handleSubmit} className="mt-7">
            <QuestionAnswer question={question} selectedOptionId={selectedOptionId} locked={submitted || finished} revealAnswer={submitted || finished} onSelect={selectOption} feedbackRef={resultRef} />

            {article && !finished && !submitted && <p role="status" className="mt-4 text-sm text-slate-500">{t("本篇已选择")}{group.filter(({ item }) => answers[item.id] !== undefined).length} / {group.length} {t("题，全部选择后统一提交判定。")}</p>}
            <div className="answer-actions mt-5">
              {buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex - 1)} disabled={questionIndex === 0} className={secondaryButton}>{t("← 上一题")}</button>}
              {finished ? (
                !lastQuestion && buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={`${primaryButton} flex-1`}>{t("下一题 →")}</button>
              ) : article && !submitted ? (
                !groupComplete && buttonsEnabled && selectedOptionId !== null && firstGroupDraft ? <button type="button" onClick={() => goToQuestion(firstGroupDraft.index)} className={`${primaryButton} flex-1`}>{t("下一小题 →")}</button> : <button type="submit" disabled={!groupComplete} className={`${primaryButton} flex-1`}>{t(question.category === "听力" ? "提交本组答案" : "提交本篇答案")}</button>
              ) : article && nextArticleIndex < totalQuestions ? (
                buttonsEnabled && <button type="button" onClick={() => goToQuestion(nextArticleIndex)} className={`${primaryButton} flex-1`}>{t("下一篇 →")}</button>
              ) : article ? (
                remainingQuestions === 0 ? <button type="button" onClick={finishPaper} className={`${primaryButton} flex-1`}>{t("完成并交卷")}</button> : buttonsEnabled && <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={`${primaryButton} flex-1`}>{t("继续未完成题（")}{remainingQuestions}）</button>
              ) : !submitted ? (
                <>
                  {!instantFeedback && <button type="submit" disabled={selectedOptionId === null} className={`${primaryButton} flex-1`}>{t("提交答案")}</button>}
                  {instantFeedback && <p className="flex-1 self-center text-sm text-slate-500">{t("点击选项即可查看解析")}</p>}
                  {buttonsEnabled && !lastQuestion && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={secondaryButton}>{t("跳过")}</button>}
                </>
              ) : !lastQuestion ? (
                buttonsEnabled && <button type="button" onClick={() => goToQuestion(questionIndex + 1)} className={`${primaryButton} flex-1`}>{t("下一题 →")}</button>
              ) : remainingQuestions > 0 ? (
                buttonsEnabled && <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={`${primaryButton} flex-1`}>{t("继续未完成题（")}{remainingQuestions}）</button>
              ) : <button type="button" onClick={finishPaper} className={`${primaryButton} flex-1`}>{t("完成并交卷")}</button>}
            </div>
          </form>
        </section>
        </ReadingWorkspace>
        <div className="mt-5 hidden lg:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-500">{t(finished ? "本次练习已完成，可切题回顾解析。" : remainingQuestions === 0 ? "所有题目已提交，可以交卷查看成绩汇总。" : `还有 ${remainingQuestions} 题未提交。已选择的题目提交后才计入进度。`)}</p>
          {!lastQuestion && (finished ? <button type="button" onClick={() => setShowResults(true)} className={secondaryButton}>{t("返回结算")}</button> : remainingQuestions === 0 ? <button type="button" onClick={finishPaper} className={primaryButton}>{t("完成并交卷")}</button> : buttonsEnabled && submitted && firstIncompleteIndex !== questionIndex ? <button type="button" onClick={() => goToQuestion(firstIncompleteIndex)} className={secondaryButton}>{t("继续未完成题（")}{remainingQuestions}）</button> : null)}
        </div>
        </>
        )}
        </div>
        <footer className="session-progress" aria-label={t("练习进度")}>
          <div className="mt-5 flex justify-between text-sm text-slate-600">
            <label htmlFor="answer-progress">{t("答题进度")}</label>
            <span>{completedQuestions} / {totalQuestions} · {percent}%</span>
          </div>
          <progress
            id="answer-progress"
            value={completedQuestions}
            max={totalQuestions}
            className="mt-2 block h-2 w-full overflow-hidden rounded-full border-0 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-indigo-600 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-indigo-600"
          />
        </footer>
        <p className="hidden lg:col-span-2 lg:block mt-5 text-center text-xs leading-6 text-slate-500">
          {t(paper.level)} · {translatePeriod(paper.periodLabel ?? `${paper.year} 原创版`, paper.source, t)} · {t(paper.sourceLabel ?? "原创模拟题库")} · {t(paper.typeLabel)}{t("。进度与成绩保存在当前浏览器。")}</p>
      </div>
      <PracticeConfirmDialog dialogRef={dialogRef} action={confirmationAction} onConfirm={confirmAction} onClose={() => setConfirmationAction(null)} progressSaved={!saveError} />
    </main>
  );
}
