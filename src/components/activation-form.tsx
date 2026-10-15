"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ActivationForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = new FormData(event.currentTarget).get("code");
    try {
      const response = await fetch("/api/activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (!response.ok) { setError(response.status === 401 ? "暗号不正确，请检查后重试。" : "验证失败，请稍后重试。"); setPending(false); return; }
      router.replace(returnTo);
      router.refresh();
    } catch { setError("网络连接失败，请重试。"); setPending(false); }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <section aria-labelledby="activation-title" className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold text-indigo-600">JLPT Practice</p>
        <h1 id="activation-title" className="mt-4 text-2xl font-bold">输入暗号开始答题</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">请输入暗号，当前浏览器验证后 30 天内无需重复输入。</p>
        <form onSubmit={activate} className="mt-6">
          <label className="block text-sm font-semibold">暗号
            <input autoFocus name="code" type="password" required maxLength={100} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="请输入暗号" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 text-base" />
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          <button type="submit" disabled={pending} className="mt-5 min-h-12 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{pending ? "正在验证……" : "验证并开始"}</button>
        </form>
        <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-sm text-indigo-600">返回首页</Link>
      </section>
    </main>
  );
}
