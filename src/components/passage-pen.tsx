"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { useUserPreferences } from "@/lib/user-preferences";
import { findInkAnchor, inkFrame, passageTextNodes, type InkStroke } from "./passage-pen-geometry";

const inkChanged = "jlpt-practice:passage-ink-changed";
type InkUpdate = { key: string; strokes: InkStroke[]; saveError: boolean };

function readStrokes(key: string): InkStroke[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) return value.filter(stroke => stroke && typeof stroke.points === "string" &&
      (stroke.anchor?.kind === "surface" || stroke.anchor?.kind === "image" && Number.isInteger(stroke.anchor.index) ||
        stroke.anchor?.kind === "text" && Number.isInteger(stroke.anchor.node) && Number.isInteger(stroke.anchor.offset)));
  } catch { /* Reading and drawing also work with browser storage disabled. */ }
  return [];
}

function transform(frame: ReturnType<typeof inkFrame>) {
  return `translate(${frame.x} ${frame.y}) scale(${frame.width} ${frame.height})`;
}

interface PassagePenProps {
  passageKey: string;
  children: ReactNode;
}

export default function PassagePen({ passageKey, children }: PassagePenProps) {
  const { t } = useI18n();
  const { passagePenEnabled = true } = useUserPreferences().data.practice;
  const key = `jlpt-practice.passage-ink.v1:${passageKey}`;
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState(() => readStrokes(key));
  const [saveError, setSaveError] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const penButtonRef = useRef<HTMLButtonElement>(null);
  const savedRef = useRef<SVGGElement>(null);
  const previewRef = useRef<SVGPolylineElement>(null);
  const active = useRef<{ id: number; anchor: InkStroke["anchor"]; frame: ReturnType<typeof inkFrame> } | null>(null);
  const pan = useRef<{ scroller: Element; y: number } | null>(null);

  if (!passagePenEnabled && drawing) setDrawing(false);

  useLayoutEffect(() => {
    if (!drawing) {
      active.current = null;
      pan.current = null;
      previewRef.current?.removeAttribute("points");
    }
  }, [drawing]);

  useLayoutEffect(() => {
    // Several favorite cards can show the same passage in one tab.
    function syncInk(event: Event) {
      const update = (event as CustomEvent<InkUpdate>).detail;
      if (update?.key !== key) return;
      if (!update.strokes.length) {
        active.current = null;
        previewRef.current?.removeAttribute("points");
      }
      setStrokes(update.strokes);
      setSaveError(update.saveError);
    }
    window.addEventListener(inkChanged, syncInk);
    return () => window.removeEventListener(inkChanged, syncInk);
  }, [key]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const saved = savedRef.current;
    if (!content || !saved || !strokes.length) return;
    const position = () => {
      const nodes = passageTextNodes(content);
      strokes.forEach((stroke, i) => saved.children[i]?.setAttribute("transform", transform(inkFrame(content, nodes, stroke.anchor))));
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(content);
    content.addEventListener("scroll", position, true);
    content.addEventListener("load", position, true);
    return () => {
      observer.disconnect();
      content.removeEventListener("scroll", position, true);
      content.removeEventListener("load", position, true);
    };
  }, [strokes]);

  function save(next: InkStroke[]) {
    let failed = false;
    try {
      if (next.length) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch { failed = true; }
    window.dispatchEvent(new CustomEvent<InkUpdate>(inkChanged, { detail: { key, strokes: next, saveError: failed } }));
  }

  function clearInk() {
    save([]);
    penButtonRef.current?.focus({ preventScroll: true });
  }

  function addPoint(event: PointerEvent<HTMLDivElement>) {
    const stroke = active.current;
    const preview = previewRef.current;
    if (stroke?.id !== event.pointerId || !preview?.ownerSVGElement || !contentRef.current) return;
    const bounds = contentRef.current.getBoundingClientRect();
    const point = preview.ownerSVGElement.createSVGPoint();
    point.x = Number(((event.clientX - bounds.left - stroke.frame.x) / stroke.frame.width).toFixed(4));
    point.y = Number(((event.clientY - bounds.top - stroke.frame.y) / stroke.frame.height).toFixed(4));
    // Append just this sample during the gesture. Serialize once on pointer-up.
    preview.points.appendItem(point);
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    const content = contentRef.current;
    if (!drawing || !content || !event.isPrimary || event.button !== 0 || active.current) return;
    event.preventDefault();
    const nodes = passageTextNodes(content);
    const anchor = findInkAnchor(content, nodes, event.target, event.clientX, event.clientY);
    const frame = inkFrame(content, nodes, anchor);
    active.current = { id: event.pointerId, anchor, frame };
    previewRef.current?.setAttribute("transform", transform(frame));
    event.currentTarget.setPointerCapture(event.pointerId);
    addPoint(event);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const stroke = active.current;
    if (stroke?.id !== event.pointerId) return;
    if (event.type === "pointerup") {
      addPoint(event); // The two coincident endpoints of a tap make a round dot.
      const points = previewRef.current?.getAttribute("points");
      if (points) save([...strokes, { anchor: stroke.anchor, points }]);
    }
    active.current = null;
    previewRef.current?.removeAttribute("points");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function panWithTwoFingers(event: TouchEvent<HTMLDivElement>) {
    if (!drawing || event.touches.length !== 2) {
      pan.current = null;
      return;
    }
    const y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    if (event.type === "touchstart") {
      // Lift the pen as soon as a second finger joins the gesture.
      active.current = null;
      previewRef.current?.removeAttribute("points");
      let pane = event.currentTarget.parentElement;
      while (pane && !["auto", "scroll"].includes(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
      pan.current = { scroller: pane ?? document.scrollingElement ?? document.documentElement, y };
    } else if (pan.current) {
      pan.current.scroller.scrollTop += pan.current.y - y;
      pan.current.y = y;
    }
  }

  return <div className="passage-pen">
    {passagePenEnabled && <div className="passage-pen-tools">
      {(drawing || strokes.length > 0) && (
        <button type="button" aria-label={t("清除本篇全部笔迹")} disabled={!strokes.length} onClick={clearInk}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M9 6V3h6v3m3 0-1 15H7L6 6m4 4v7m4-7v7" />
          </svg>
        </button>
      )}
      {drawing && (
        <button type="button" aria-label={t("撤销上一笔")} disabled={!strokes.length} onClick={() => save(strokes.slice(0, -1))}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)" />
          </svg>
        </button>
      )}
      <button ref={penButtonRef} type="button" aria-label={t("画笔")} aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m14.5 5.5 4 4M3 21l4.5-1 13-13a2.8 2.8 0 0 0-4-4l-13 13L3 21Z" />
        </svg>
      </button>
    </div>}
    {saveError && <p role="status" className="sr-only">{t("笔迹仅在当前页面保留。")}</p>}
    <div className="passage-pen-surface" data-drawing={drawing || undefined} onPointerDown={begin} onPointerMove={addPoint}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onTouchStart={panWithTwoFingers} onTouchMove={panWithTwoFingers}
      onClickCapture={event => { if (drawing) { event.preventDefault(); event.stopPropagation(); } }}>
      <div ref={contentRef} className="flow-root">{children}</div>
      <svg aria-hidden="true" className="passage-ink">
        <g ref={savedRef}>{strokes.map((stroke, i) => <polyline key={i} points={stroke.points} />)}</g>
        <polyline ref={previewRef} />
      </svg>
    </div>
  </div>;
}
