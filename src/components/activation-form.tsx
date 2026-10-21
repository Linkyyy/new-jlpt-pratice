"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

import { useEffect, useState, type FormEvent } from "react";
import { VISIT_ACCESS_KEY, readVisitToken, safeAccessReturnPath } from '@/lib/visit-access.mjs';

export default function ActivationForm({ returnTo }: { returnTo: string }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    async function restore() {
      try {
        const token = readVisitToken(localStorage);
        if (token) {
          const response = await fetch('/api/activation', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token}), signal: abort.signal});
          if (response.ok && !abort.signal.aborted) {
            const data = await response.json();
            try { localStorage.setItem(VISIT_ACCESS_KEY, data.token); } catch { /* Cookie still remembers this browser. */ }
            window.location.replace(safeAccessReturnPath(returnTo));
            return;
          }
        }
      } catch { /* Keep the form usable without localStorage or network restoration. */ }
      if (!abort.signal.aborted) setChecking(false);
    }
    void restore();
    return () => abort.abort();
  }, [returnTo]);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = new FormData(event.currentTarget).get("code");
    try {
      const response = await fetch("/api/activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (!response.ok) { setError(response.status === 401 ? "暗号不正确，请检查后重试。" : "验证失败，请稍后重试。"); setPending(false); return; }
      const data = await response.json();
      try { localStorage.setItem(VISIT_ACCESS_KEY, data.token); } catch { /* Cookie is sufficient. */ }
      window.location.replace(safeAccessReturnPath(returnTo));
    } catch { setError("网络连接失败，请重试。"); setPending(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <section aria-labelledby="activation-title" className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-indigo-600">JLPT Practice</p>
        <h1 id="activation-title" className="mt-4 text-2xl font-bold">{t("输入暗号查看词频统计")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{t("仅首次查看词频统计需要验证，刷题无需暗号。")}</p>
        {checking ? <p role="status" className="mt-6 text-sm text-slate-500">{t('正在检查访问状态……')}</p> : <>
        <form onSubmit={activate} className="mt-6">
          <label className="block text-sm font-semibold">{t("暗号")}<input autoFocus name="code" type="password" required maxLength={100} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={t("请输入暗号")} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 text-base" />
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-rose-700">{t(error)}</p>}
          <button type="submit" disabled={pending} className="mt-5 min-h-12 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{t(pending ? "正在验证……" : "验证并查看")}</button>
        </form>
        </>}
        <Link href="/" className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-indigo-600">{t("返回刷题首页")}</Link>
      </section>
    </main>
  );
}
