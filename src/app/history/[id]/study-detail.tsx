"use client";

import DisplaySettings from "@/components/display-settings";
import { useI18n } from "@/lib/i18n";

import Link from "next/link";
import { studyAttemptUrl, studyScore, useStudyHistory } from "@/lib/study-store";
import { attemptTitle, studyDate } from "@/components/study-dashboard";

export default function StudyDetail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { data, ready, error } = useStudyHistory();
  const attempt = data.attempts.find(a => a.id === id);
  if (!ready) return <p role="status" className="p-8">{t("正在读取作答记录……")}</p>;
  if (!attempt) return <main className="p-8"><p role="alert">{t(error ?? "当前浏览器没有这份记录。")}</p><Link href="/history" className="mt-5 inline-block text-indigo-600">{t("返回学习记录")}</Link></main>;
  const score = studyScore(attempt), completed = attempt.status === "completed";
  const choice = (id: string | undefined, questionId: string) => id ? questionId.startsWith("imported:") ? String(id.charCodeAt(0) - 64) : id : "—";
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:p-8"><div className="mx-auto max-w-3xl">
    <div className="flex items-center justify-between"><Link href="/history" className="text-sm font-semibold text-indigo-600">{t("← 学习记录")}</Link><DisplaySettings /></div>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8"><h1 className="text-xl font-bold">{attemptTitle(attempt, t)}</h1><p className="mt-2 text-sm text-slate-500">{studyDate(attempt.createdAt, locale)} · {t(attempt.mode === "exam" ? "考试" : "练习")} · {t(completed ? "已完成" : "未完成")}{t(attempt.timedOut ? " · 到时交卷" : "")}</p>
      {completed ? <><p className="mt-6 text-4xl font-bold text-indigo-600">{score.percent}<span className="ml-1 text-sm font-normal text-slate-500">{t("分")}</span></p><p className="mt-3 text-sm text-slate-600">{t("答对")}{score.correct} {t("· 答错")}{score.wrong} {t("· 未作答")}{score.unanswered} {t("· 共")}{score.total} {t("题")}</p><p className="mt-2 text-xs text-slate-400">{t("每题等权折算百分制，非 JLPT 官方分数。历史成绩按本次交卷答案保留。")}</p></> : <p className="mt-6 text-slate-600">{t("已")}{t(attempt.mode === "exam" ? "选择" : "提交")} {attempt.mode === "exam" ? Object.keys(attempt.answers).length : score.answered} / {score.total} {t("题")}{t(attempt.mode === "exam" && attempt.deadline ? "，离开期间仍计时。" : "")}</p>}
      <Link href={studyAttemptUrl(attempt)} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white">{t(completed ? "查看题目与解析" : "继续作答")} →</Link>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8" aria-label={t("逐题作答记录")}><h2 className="font-bold">{t("作答足迹")}</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{attempt.questions.map((q, index) => {
      const a = attempt.answers[q.id], graded = a?.submitted, correct = a?.selectedOptionId === q.correctOptionId;
      return <div key={q.id} className={`rounded-xl border p-3 text-sm ${graded ? correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}><p className="font-semibold">{index + 1} · {t(q.category)}{t(q.sourceQuestionNumber != null ? ` · 原题号 ${q.sourceQuestionNumber}` : "")}</p><p className="mt-1 text-xs text-slate-600">{t(graded ? `${correct ? "答对" : "答错"} · 已选 ${choice(a.selectedOptionId, q.id)} · 正确 ${choice(q.correctOptionId, q.id)}` : a ? `已选 ${choice(a.selectedOptionId, q.id)} · ${completed ? "未计分" : "待提交"}` : "未作答")}</p></div>;
    })}</div></section>
  </div></main>;
}
