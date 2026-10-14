"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { PracticeQuestion } from "@/data/practice-question";
import QuestionBody from "@/components/question-body";

export function readingGroupKey(question: PracticeQuestion) {
  return question.category === "阅读" && question.passage?.trim()
    ? JSON.stringify([question.passage.trim(), question.richText ?? false, question.media ?? null])
    : question.id;
}

type QuestionStatus = "empty" | "draft" | "correct" | "incorrect" | "answered";
const statusLabels: Record<QuestionStatus, string> = { empty: "未作答", draft: "待提交", correct: "回答正确", incorrect: "回答错误", answered: "已作答" };
interface ReadingWorkspaceProps {
  question: PracticeQuestion;
  questions: readonly PracticeQuestion[];
  questionIndex: number;
  largeText?: boolean;
  onNavigate: (index: number) => void;
  getStatus: (question: PracticeQuestion) => QuestionStatus;
  children: ReactNode;
}

export default function ReadingWorkspace(props: ReadingWorkspaceProps) {
  if (props.question.category !== "阅读" || !props.question.passage?.trim()) return props.children;
  return <ReadingSheet key={readingGroupKey(props.question)} {...props} />;
}

function ReadingSheet({ question, questions, questionIndex, largeText, onNavigate, getStatus, children }: ReadingWorkspaceProps) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const articleRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const group = questions.flatMap((item, index) => readingGroupKey(item) === readingGroupKey(question) ? [{ item, index }] : []);

  useEffect(() => { articleRef.current?.scrollIntoView({ block: "start" }); }, []);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    drag.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) < 36 || Math.abs(dy) < Math.abs(event.clientX - start.x)) return;
    dragged.current = true;
    setExpanded(dy < 0);
  }

  return (
    <div className="reading-workspace">
      <article ref={articleRef} aria-label="阅读文章" className="reading-article rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">阅读文章</h2>
        <p className="mt-2 text-xs leading-6 text-slate-500">本篇共 {group.length} 题 · 上拉底部题目栏作答，下拉收起后继续阅读。</p>
        <QuestionBody question={question} largeText={largeText} part="passage" />
      </article>
      <section aria-label="阅读题目抽屉" className={`reading-sheet ${expanded ? "reading-sheet-expanded" : ""}`}>
        <button type="button" className="reading-sheet-handle" aria-expanded={expanded} aria-controls={id}
          onPointerDown={startDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = null; }}
          onClick={() => { if (dragged.current) { dragged.current = false; return; } setExpanded((previous) => !previous); }}>
          <span aria-hidden="true" className="reading-grip" />
          <span className="flex w-full items-center justify-between gap-3"><span>第 {questionIndex + 1} 题 · 本篇 {group.length} 题</span><span className="text-xs text-indigo-600">{expanded ? "收起题目 ↓" : "上拉答题 ↑"}</span></span>
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
