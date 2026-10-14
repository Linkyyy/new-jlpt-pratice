"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** One set of controls, shown inline on desktop and in a modal drawer on mobile. */
export default function ResponsivePanel({ title, trigger, children, className = "" }: { title: string; trigger?: string; children: ReactNode; className?: string }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    function sync() {
      const element = dialog.current;
      if (!element) return;
      const previousFocus = document.activeElement;
      const previousScroll = { left: window.scrollX, top: window.scrollY };
      if (element.open) element.close();
      setExpanded(false);
      if (media.matches) {
        element.show();
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
        window.scrollTo(previousScroll);
      }
    }
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <aside className={`responsive-panel ${className}`}>
      <button type="button" aria-haspopup="dialog" aria-controls={id} aria-expanded={expanded} onClick={() => { dialog.current?.showModal(); setExpanded(true); }} className="panel-trigger">{trigger ?? title} <span aria-hidden="true">☰</span></button>
      <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} className="panel-dialog" onClose={() => setExpanded(false)} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) && !window.matchMedia("(min-width: 1024px)").matches) dialog.current?.close(); }}>
        <div className="panel-inner" onClick={(event) => { if (event.target instanceof Element && event.target.closest('nav[aria-label="题目导航"] button') && !window.matchMedia("(min-width: 1024px)").matches) dialog.current?.close(); }}>
          <div className="panel-heading"><h2 id={`${id}-title`} className="font-bold text-slate-900">{title}</h2><button type="button" aria-label={`关闭${title}`} onClick={() => dialog.current?.close()} className="panel-close">✕</button></div>
          {children}
        </div>
      </dialog>
    </aside>
  );
}
