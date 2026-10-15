"use client";

import { useId, type ReactNode } from "react";

export default function FloatingSettings({ title = "练习设置", children }: { title?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="floating-settings">
      <button type="button" popoverTarget={id} aria-haspopup="dialog" aria-controls={id} aria-label={title} title={title} className="settings-toggle">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="white" /><circle cx="15" cy="17" r="3" fill="white" /></svg>
      </button>
      <section id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`} className="floating-settings-window">
        <div className="floating-settings-heading">
          <h2 id={`${id}-title`} className="text-lg font-bold">{title}</h2>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label={`隐藏${title}`} className="settings-toggle">✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}
