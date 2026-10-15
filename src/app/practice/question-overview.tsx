"use client";

import { useI18n } from "@/lib/i18n";

import { useMemo } from "react";
import { questionTrails, useStudyHistory } from "@/lib/study-store";
import type { PracticeQuestion, QuestionCategory } from "@/data/practice-question";
import { questionCategories } from "@/data/practice-question";

type QuestionStatus = "empty" | "draft" | "correct" | "incorrect" | "answered";
const statusLabels: Record<QuestionStatus, string> = { empty: "未作答", draft: "已选择，未提交", correct: "回答正确", incorrect: "回答错误", answered: "已作答" };

interface OverviewProps {
  questions: readonly PracticeQuestion[];
  currentIndex?: number;
  onSelect: (index: number) => void;
  getStatus: (question: PracticeQuestion) => QuestionStatus;
  label?: string;
  results?: boolean;
}

function problemGroup(question: PracticeQuestion): { key: string; label: string } {
  const instruction = question.instruction?.replace(/<[^>]*>/g, " ").normalize("NFKC") ?? "";
  const number = instruction.match(/問[題题]\s*(\d+)/)?.[1];
  const paper = question.id.startsWith("imported:") ? question.id.split(":").slice(0, 4).join(":") : question.id.match(/^N[1-5]-\d{4}/)?.[0] ?? question.level;
  return { key: `${paper}:${number ?? "all"}`, label: number ? `问题${number}` : "练习题" };
}

export default function QuestionOverview({ questions, currentIndex, onSelect, getStatus, label = "题目导航", results = false }: OverviewProps) {
  const { t } = useI18n();
  const { data } = useStudyHistory();
  const trails = useMemo(() => questionTrails(data), [data]);
  const categories = new Map<QuestionCategory, Map<string, { label: string; items: { question: PracticeQuestion; index: number }[] }>>();
  questions.forEach((question, index) => {
    if (!categories.has(question.category)) categories.set(question.category, new Map());
    const groups = categories.get(question.category)!;
    const group = problemGroup(question);
    if (!groups.has(group.key)) groups.set(group.key, { label: group.label, items: [] });
    groups.get(group.key)!.items.push({ question, index });
  });
  return (
    <nav data-question-overview aria-label={t(label)} className={`question-overview ${results ? "overview-results" : ""}`}>
      {questionCategories.map((category) => {
        const groups = categories.get(category);
        if (!groups) return null;
        return <section key={category} aria-label={t(`${category}题目`)} className="overview-category">
          <h3 className="overview-category-title">— {t(category)} —</h3>
          {[...groups.entries()].map(([key, group]) => <div key={key} className="overview-group">
            <p className="overview-group-label">{t(group.label)}</p>
            <div className="overview-numbers">
              {group.items.map(({ question, index }) => {
                const status = getStatus(question);
                const visited = (status === "empty" || status === "draft") && trails.has(question.id);
                return <button key={question.id} type="button" onClick={() => onSelect(index)} aria-current={currentIndex === index ? "step" : undefined} aria-label={t("第 {0} 题，{1}{2}", { 0: index + 1, 1: t(statusLabels[status]), 2: visited ? t("，曾练习") : "" })} title={t(`${question.sourceQuestionNumber != null ? `原题号 ${question.sourceQuestionNumber}` : ""}${visited ? " · 曾练习" : ""}`)} className={`relative question-number question-${status} ${currentIndex === index ? "question-current" : ""}`}>{index + 1}{visited && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />}</button>;
              })}
            </div>
          </div>)}
        </section>;
      })}
    </nav>
  );
}
