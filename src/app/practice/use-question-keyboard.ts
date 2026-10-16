"use client";

import { useEffect, type RefObject } from "react";

interface QuestionKeyboardOptions {
  enabled: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onSelect: (optionIndex: number) => void;
  onAdvance: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

const interactiveTarget = "input, textarea, select, button, a, audio, video, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider']";

/** Keyboard shortcuts are scoped to the visible exercise and never override controls or overlays. */
export function useQuestionKeyboard({ enabled, anchorRef, onSelect, onAdvance, onNavigate }: QuestionKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (document.visibilityState !== "visible" || !window.matchMedia("(any-hover: hover) and (any-pointer: fine)").matches) return;
      const anchor = anchorRef.current;
      const root = anchor?.closest("main");
      if (!root || !anchor || root.closest("[hidden], [inert], [aria-hidden='true']") || anchor.getClientRects().length === 0) return;
      // The desktop answer card is an inline, non-modal dialog, not an overlay.
      if (document.querySelector("dialog:modal, dialog[open]:not(.panel-dialog), [popover]:popover-open, [role='dialog'][aria-modal='true']")) return;
      if ([event.target, document.activeElement].some(target => target instanceof Element && target.closest(interactiveTarget))) return;
      if (window.getSelection()?.toString()) return;

      if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        onSelect(Number(event.key) - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        onAdvance();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        onNavigate(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, anchorRef, onSelect, onAdvance, onNavigate]);
}
