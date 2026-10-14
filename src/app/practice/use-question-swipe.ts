"use client";

import { useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

/** Horizontal gestures navigate; vertical scrolling and controls keep their usual behavior. */
export function useQuestionSwipe(onNavigate: (direction: -1 | 1) => void, enabled = true) {
  const gesture = useRef<{ x: number; y: number; maxY: number; started: number } | null>(null);
  const suppressClick = useRef(false);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    suppressClick.current = false;
    gesture.current = null;
    if (!enabled || event.touches.length !== 1 || document.querySelector("dialog:modal")) return;
    if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, audio, video, [contenteditable]")) return;
    const touch = event.touches[0];
    gesture.current = { x: touch.clientX, y: touch.clientY, maxY: 0, started: Date.now() };
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1) { gesture.current = null; return; }
    if (gesture.current) gesture.current.maxY = Math.max(gesture.current.maxY, Math.abs(event.touches[0].clientY - gesture.current.y));
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!enabled || !start || event.changedTouches.length !== 1 || event.touches.length !== 0) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = Math.abs(event.changedTouches[0].clientY - start.y);
    if (Date.now() - start.started > 1000 || Math.abs(dx) < 64 || Math.max(dy, start.maxY) > 40 || Math.abs(dx) < dy * 2) return;
    if (window.getSelection()?.toString()) return;
    suppressClick.current = true;
    onNavigate(dx < 0 ? 1 : -1);
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerDownCapture(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch") suppressClick.current = false;
  }

  return { onPointerDownCapture, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: () => { gesture.current = null; }, onClickCapture };
}
