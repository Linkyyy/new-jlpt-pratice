"use client";

import { useEffect } from "react";

type Origin = { x: number; y: number };

/** Keep desktop dialogs/popovers near their invoker; mobile sheets keep their layout. */
export default function PopupPositioning() {
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const opened = new Map<HTMLElement, Origin>();
    let pointer: (Origin & { at: number }) | null = null;
    const margin = 16, gap = 12;
    function reset(element: HTMLElement) {
      opened.delete(element); observer.unobserve(element);
      delete element.dataset.cursorPopup;
      element.style.removeProperty("--popup-left");
      element.style.removeProperty("--popup-top");
    }
    function isOpen(element: HTMLElement) {
      return element instanceof HTMLDialogElement ? element.open && element.matches(":modal") : element.matches(":popover-open");
    }
    function place(element: HTMLElement, origin: Origin) {
      if (element.hasAttribute("data-fullscreen")) { reset(element); return; }
      if (!element.isConnected || !isOpen(element)) { reset(element); return; }
      if (!desktop.matches) { delete element.dataset.cursorPopup; return; }
      element.dataset.cursorPopup = "";
      const { width, height } = element.getBoundingClientRect();
      const right = window.innerWidth - width - margin;
      const bottom = window.innerHeight - height - margin;
      const left = origin.x + gap <= right ? origin.x + gap : origin.x - width - gap;
      const top = origin.y + gap <= bottom ? origin.y + gap : origin.y - height - gap;
      element.style.setProperty("--popup-left", `${Math.max(margin, Math.min(left, right))}px`);
      element.style.setProperty("--popup-top", `${Math.max(margin, Math.min(top, bottom))}px`);
    }
    const observer = new ResizeObserver(entries => {
      for (const { target } of entries) {
        const element = target as HTMLElement, origin = opened.get(element);
        if (origin) place(element, origin);
      }
    });
    function rememberPointer(event: PointerEvent) {
      pointer = event.pointerType === "mouse" ? { x: event.clientX, y: event.clientY, at: Date.now() } : null;
    }
    function clearPointer() { pointer = null; }
    function onToggle(event: Event) {
      const element = event.target;
      if (!(element instanceof HTMLElement) || !element.matches("dialog, [popover]")) return;
      if (element.hasAttribute("data-fullscreen")) { reset(element); return; }
      if ((event as ToggleEvent).newState !== "open") { reset(element); return; }
      const focus = document.activeElement;
      const rect = focus instanceof HTMLElement && focus !== document.body ? focus.getBoundingClientRect() : null;
      const origin = opened.get(element) ?? (pointer && Date.now() - pointer.at < 1500 ? { x: pointer.x, y: pointer.y } : rect ? { x: rect.left, y: rect.bottom } : null);
      if (!origin) return;
      opened.set(element, origin);
      // Native popover activation finishes after beforetoggle's microtask checkpoint.
      // Keep the invoker's coordinates now, then measure once the popup is visible.
      requestAnimationFrame(() => {
        if (!isOpen(element)) return;
        observer.observe(element); place(element, origin);
      });
    }
    function reposition() { for (const [element, origin] of opened) place(element, origin); }
    document.addEventListener("pointerdown", rememberPointer, true);
    document.addEventListener("keydown", clearPointer, true);
    document.addEventListener("beforetoggle", onToggle, true);
    document.addEventListener("toggle", onToggle, true);
    window.addEventListener("resize", reposition);
    desktop.addEventListener("change", reposition);
    return () => {
      document.removeEventListener("pointerdown", rememberPointer, true);
      document.removeEventListener("keydown", clearPointer, true);
      document.removeEventListener("beforetoggle", onToggle, true);
      document.removeEventListener("toggle", onToggle, true);
      window.removeEventListener("resize", reposition);
      desktop.removeEventListener("change", reposition);
      for (const element of opened.keys()) reset(element);
      observer.disconnect();
    };
  }, []);
  return null;
}
