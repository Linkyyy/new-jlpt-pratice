"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { PracticeQuestion } from "@/data/practice-question";
import QuestionBody from "@/components/question-body";
import { articleGroup, articleGroupKey, usesArticleDrawer } from "./article-questions";

type QuestionStatus = "empty" | "draft" | "correct" | "incorrect" | "answered";
const statusLabels: Record<QuestionStatus, string> = { empty: "未作答", draft: "待提交", correct: "回答正确", incorrect: "回答错误", answered: "已作答" };
interface ReadingWorkspaceProps {
  question: PracticeQuestion;
  questions: readonly PracticeQuestion[];
  questionIndex: number;
  largeText?: boolean;
  reviewing?: boolean;
  onNavigate: (index: number) => void;
  getStatus: (question: PracticeQuestion) => QuestionStatus;
  children: ReactNode;
}

export default function ReadingWorkspace(props: ReadingWorkspaceProps) {
  if (!usesArticleDrawer(props.question)) return props.children;
  return <ReadingSheet key={articleGroupKey(props.question)} {...props} />;
}

function sheetBounds(sheet: HTMLElement, handle: HTMLElement) {
  const styles = window.getComputedStyle(sheet);
  const minimum = handle.getBoundingClientRect().height + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const topSpace = parseFloat(styles.getPropertyValue("--sheet-top-space")) || 16;
  return { minimum, maximum: Math.max(minimum, viewport - topSpace), viewport };
}

function ReadingSheet({ question, questions, questionIndex, largeText, reviewing = false, onNavigate, getStatus, children }: ReadingWorkspaceProps) {
  const [expanded, setExpanded] = useState(reviewing);
  const [height, setHeight] = useState<number | null>(null);
  const id = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const heightRef = useRef<number | null>(null);
  const preferredHeight = useRef<number | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; height: number; pointerId: number } | null>(null);
  const dragged = useRef(false);
  const group = articleGroup(questions, question);
  const articleTitle = question.category === "语法" ? "语法文章" : "阅读文章";

  useEffect(() => { articleRef.current?.scrollIntoView({ block: "start" }); }, []);

  const resizeSheet = useCallback((requested: number, commit = true) => {
    const sheet = sheetRef.current;
    const handle = handleRef.current;
    if (!sheet || !handle) return;
    const { minimum, maximum } = sheetBounds(sheet, handle);
    let next = Math.min(maximum, Math.max(minimum, requested));
    const open = next > minimum + 1;
    if (!open) next = minimum;
    heightRef.current = next;
    // Move immediately with the pointer; commit React state when the gesture ends.
    sheet.style.height = `${next}px`;
    setExpanded(open);
    if (open && commit) preferredHeight.current = next;
    if (commit) setHeight(next);
  }, []);

  useEffect(() => {
    function fitViewport() {
      if (heightRef.current !== null) resizeSheet(heightRef.current);
    }
    const viewport = window.visualViewport;
    window.addEventListener("resize", fitViewport);
    viewport?.addEventListener("resize", fitViewport);
    return () => {
      window.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("resize", fitViewport);
    };
  }, [resizeSheet]);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !sheetRef.current) return;
    drag.current = { x: event.clientX, y: event.clientY, height: sheetRef.current.getBoundingClientRect().height, pointerId: event.pointerId };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dy = event.clientY - start.y;
    if (!dragged.current && (Math.abs(dy) < 4 || Math.abs(dy) < Math.abs(event.clientX - start.x))) return;
    dragged.current = true;
    sheetRef.current?.setAttribute("data-resizing", "true");
    event.preventDefault();
    resizeSheet(start.height - dy, false);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    drag.current = null;
    sheetRef.current?.removeAttribute("data-resizing");
    if (dragged.current && heightRef.current !== null) resizeSheet(heightRef.current);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function toggle() {
    if (!sheetRef.current || !handleRef.current) return;
    const { minimum, viewport } = sheetBounds(sheetRef.current, handleRef.current);
    if (expanded) preferredHeight.current = sheetRef.current.getBoundingClientRect().height;
    resizeSheet(expanded ? minimum : preferredHeight.current ?? viewport * .72);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (!sheetRef.current || !handleRef.current) return;
    const { minimum, maximum } = sheetBounds(sheetRef.current, handleRef.current);
    const current = sheetRef.current.getBoundingClientRect().height;
    const targets: Record<string, number> = { ArrowUp: current + 32, ArrowDown: current - 32, Home: minimum, End: maximum };
    if (!(event.key in targets)) return;
    event.preventDefault();
    resizeSheet(targets[event.key]);
  }

  return (
    <div className="reading-workspace">
      <article ref={articleRef} aria-label={articleTitle} className="reading-article rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">{articleTitle}</h2>
        <p className="mt-2 text-xs leading-6 text-slate-500">本篇共 {group.length} 题 · 拖动底部题目栏调整高度，点击可展开或收起。</p>
        <QuestionBody question={question} largeText={largeText} part="passage" />
      </article>
      <section ref={sheetRef} style={height === null ? undefined : { height }} aria-label={question.category === "语法" ? "语法题目抽屉" : "阅读题目抽屉"} className={`reading-sheet ${expanded ? "reading-sheet-expanded" : ""}`}>
        <button ref={handleRef} type="button" className="reading-sheet-handle" title="上下拖动调整高度；点击展开或收起；方向键微调高度" aria-expanded={expanded} aria-controls={id}
          onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={resizeWithKeyboard}
          onClick={(event) => { if (dragged.current && event.detail > 0) { dragged.current = false; return; } toggle(); }}>
          <span aria-hidden="true" className="reading-grip" />
          <span className="flex w-full items-center justify-between gap-3"><span>第 {questionIndex + 1} 题 · 本篇 {group.length} 题</span><span className="text-xs text-indigo-600">{expanded ? "收起题目 ↓" : "展开题目 ↑"}</span></span>
        </button>
        <div id={id} hidden={!expanded} className="reading-sheet-content">
          {group.length > 1 && <nav aria-label="同篇文章子题" className="reading-subquestions">
            {group.map(({ item, index }) => <button key={item.id} type="button" onClick={() => onNavigate(index)} aria-current={index === questionIndex ? "step" : undefined} aria-label={`本篇第 ${index + 1} 题，${statusLabels[getStatus(item)]}`} className={`question-number question-${getStatus(item)} ${index === questionIndex ? "question-current" : ""}`}>{index + 1}</button>)}
          </nav>}
          {children}
        </div>
      </section>
    </div>
  );
}
