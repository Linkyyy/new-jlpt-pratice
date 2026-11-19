"use client";

import { useI18n } from "@/lib/i18n";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { PracticeQuestion } from "@/data/practice-question";
import QuestionBody from "@/components/question-body";
import { articleGroup, articleGroupKey, usesArticleDrawer } from "./article-questions";

type QuestionStatus = "empty" | "draft" | "correct" | "incorrect" | "answered";
const statusLabels: Record<QuestionStatus, string> = { empty: "未作答", draft: "待提交", correct: "回答正确", incorrect: "回答错误", answered: "已作答" };
interface ReadingWorkspaceProps {
  question: PracticeQuestion;
  questions: readonly PracticeQuestion[];
  questionIndex: number;
  reviewing?: boolean;
  onNavigate: (index: number) => void;
  getStatus: (question: PracticeQuestion) => QuestionStatus;
  headerAction?: ReactNode;
  children: ReactNode;
}

export default function ReadingWorkspace(props: ReadingWorkspaceProps) {
  if (!usesArticleDrawer(props.question, props.questions)) return props.children;
  return <ReadingSheet key={articleGroupKey(props.question)} {...props} />;
}

function sheetBounds(sheet: HTMLElement, header: HTMLElement) {
  const styles = window.getComputedStyle(sheet);
  const minimum = header.getBoundingClientRect().height + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const topSpace = parseFloat(styles.getPropertyValue("--sheet-top-space")) || 16;
  const bottomSpace = parseFloat(styles.bottom) || 0;
  const cssMaximum = parseFloat(styles.maxHeight) || Infinity;
  return { minimum, maximum: Math.max(minimum, Math.min(cssMaximum, viewport - topSpace - bottomSpace)) };
}

function passageEnding(article: HTMLElement): Element | Range {
  const last = article.querySelector(".passage-pen-surface > .flow-root")?.lastElementChild;
  if (!last?.classList.contains("question-passage")) return last ?? article;
  // Track the final glyph independently of trailing whitespace and paragraph padding.
  const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
  for (let node = walker.lastChild(); node; node = walker.previousNode()) {
    const end = node.textContent?.trimEnd().length;
    if (end) {
      const range = document.createRange();
      range.setStart(node, end - 1);
      range.setEnd(node, end);
      return range;
    }
  }
  return last;
}

function ReadingSheet({ question, questions, questionIndex, reviewing = false, onNavigate, getStatus, headerAction, children }: ReadingWorkspaceProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(reviewing);
  const [height, setHeight] = useState<number | null>(null);
  const id = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const heightRef = useRef<number | null>(null);
  const sizeMode = useRef<"min" | "max" | "custom">(reviewing ? "max" : "min");
  const articleRef = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; height: number; pointerId: number } | null>(null);
  const dragged = useRef(false);
  const group = articleGroup(questions, question);
  const listening = question.category === "听力";
  const hasHeaderAction = Boolean(headerAction);
  const articleTitle = listening ? "听力材料" : question.category === "语法" ? "语法文章" : "阅读文章";

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const article = articleRef.current;
    const content = article?.closest<HTMLElement>(".session-content");
    const layout = content?.closest<HTMLElement>(".session-layout");
    if (listening || !sheet || !article || !content || !layout) return;
    const ending = passageEnding(article);
    let previousTop: number | undefined;
    const measure = () => {
      const scrollsInPanel = getComputedStyle(content).overflowY === "auto";
      const bottom = scrollsInPanel ? Math.max(0, window.innerHeight - content.getBoundingClientRect().bottom) : 0;
      layout.style.setProperty("--written-sheet-bottom", `${bottom}px`);
      const bounds = sheet.getBoundingClientRect();
      layout.style.setProperty("--written-sheet-height", `${bounds.height}px`);

      // If the reader had reached the ending, keep it above the rising drawer and pen.
      if (previousTop !== undefined && bounds.top < previousTop) {
        const end = ending.getBoundingClientRect();
        const pen = article.querySelector(".passage-pen-tools")?.getBoundingClientRect();
        const overlapsPen = pen && end.right > pen.left && end.left < pen.right;
        const limit = (overlapsPen ? pen.top : bounds.top) - 8;
        if (end.bottom <= previousTop + 1 && end.bottom > limit) {
          (scrollsInPanel ? content : document.scrollingElement)?.scrollBy(0, end.bottom - limit);
        }
      }
      previousTop = bounds.top;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheet, { box: "border-box" });
    observer.observe(content);
    return () => {
      observer.disconnect();
      layout.style.removeProperty("--written-sheet-height");
      layout.style.removeProperty("--written-sheet-bottom");
    };
  }, [listening]);

  useEffect(() => { articleRef.current?.scrollIntoView({ block: "start" }); }, []);

  useEffect(() => {
    if (!listening) questionsRef.current?.scrollTo({ top: 0 });
  }, [listening, question.id]);

  useEffect(() => {
    const navigation = toolbarRef.current?.querySelector("nav");
    if (navigation && navigation.scrollWidth > navigation.clientWidth) {
      navigation.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [expanded, hasHeaderAction, question.id]);

  const resizeSheet = useCallback((requested: number, commit = true) => {
    const sheet = sheetRef.current;
    const header = toolbarRef.current ?? handleRef.current;
    if (!sheet || !header) return;
    const { minimum, maximum } = sheetBounds(sheet, header);
    let next = Math.min(maximum, Math.max(minimum, requested));
    const open = next > minimum + 1;
    if (!open) next = minimum;
    heightRef.current = next;
    sizeMode.current = !open ? "min" : maximum - next <= 1 ? "max" : "custom";
    // Move immediately with the pointer; commit React state when the gesture ends.
    sheet.style.height = `${next}px`;
    setExpanded(open);
    if (commit) setHeight(next);
  }, []);

  useEffect(() => {
    function fitViewport() {
      if (heightRef.current === null) return;
      const mode = sizeMode.current;
      resizeSheet(mode === "max" ? Infinity : mode === "min" ? 0 : heightRef.current);
      // A viewport change should preserve whether the user snapped or dragged.
      sizeMode.current = mode;
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
    const sheet = sheetRef.current;
    const header = toolbarRef.current ?? handleRef.current;
    if (!sheet || !header) return;
    if (!expanded && !listening) {
      // Let short questions use their natural height until the reader drags the sheet.
      sheet.style.removeProperty("height");
      heightRef.current = null;
      setHeight(null);
      setExpanded(true);
      return;
    }
    const { minimum, maximum } = sheetBounds(sheet, header);
    resizeSheet(expanded ? minimum : maximum);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const sheet = sheetRef.current;
    const header = toolbarRef.current ?? handleRef.current;
    if (!sheet || !header) return;
    const { minimum, maximum } = sheetBounds(sheet, header);
    const current = sheet.getBoundingClientRect().height;
    const targets: Record<string, number> = { ArrowUp: current + 32, ArrowDown: current - 32, Home: minimum, End: maximum };
    if (!(event.key in targets)) return;
    event.preventDefault();
    resizeSheet(targets[event.key]);
  }

  const action = <span className="text-xs text-indigo-600">{t(expanded ? "收起题目 ↓" : "展开题目 ↑")}</span>;
  const handle = (
    <button ref={handleRef} type="button" className="reading-sheet-handle" title={t("上下拖动调整高度；点击展开或收起；方向键微调高度")} aria-expanded={expanded} aria-controls={id}
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={resizeWithKeyboard}
      onClick={(event) => { if (dragged.current && event.detail > 0) { dragged.current = false; return; } toggle(); }}>
      <span aria-hidden="true" className="reading-grip" />
      {listening ? <span className="flex w-full items-center justify-between gap-3">
        <span>{t("第 {0} 题 · 本段 {1} 题", { 0: questionIndex + 1, 1: group.length })}</span>
        {action}
      </span> : action}
    </button>
  );
  const subquestions = group.length > 1 && (
    <nav aria-label={t(listening ? "同段听力子题" : "同篇文章子题")} className="reading-subquestions">
      {group.map(({ item, index }) => {
        const status = getStatus(item);
        const current = index === questionIndex;
        return <button key={item.id} type="button" onClick={() => onNavigate(index)} aria-current={current ? "step" : undefined}
          aria-label={t(`本篇第 ${index + 1} 题，${statusLabels[status]}`)}
          className={`question-number question-${status}${current ? " question-current" : ""}`}>{index + 1}</button>;
      })}
    </nav>
  );

  return (
    <div className={`reading-workspace${listening ? "" : " reading-workspace-written"}`}>
      <article ref={articleRef} tabIndex={listening ? undefined : 0} aria-label={t(articleTitle)} className="reading-article rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold">{t(articleTitle)}</h2>
        <p className="mt-2 text-xs leading-6 text-slate-500">{t(listening ? "本段共" : "本篇共")}{group.length} {t("题 · 拖动底部题目栏调整高度，点击可展开或收起。")}</p>
        <QuestionBody question={question} part="passage" audioGroupId={listening ? articleGroupKey(question) : undefined} />
      </article>
      <section ref={sheetRef} style={height === null ? undefined : { height }} aria-label={t(listening ? "听力题目抽屉" : question.category === "语法" ? "语法题目抽屉" : "阅读题目抽屉")} className={`reading-sheet ${expanded ? "reading-sheet-expanded" : ""}${height === null && !listening ? " reading-sheet-auto" : ""}`}>
        {listening ? handle : <div ref={toolbarRef} className="reading-sheet-toolbar">{expanded && subquestions}{headerAction}{handle}</div>}
        <div ref={questionsRef} id={id} hidden={!expanded} className="reading-sheet-content">
          {listening && subquestions}
          {children}
        </div>
      </section>
    </div>
  );
}
