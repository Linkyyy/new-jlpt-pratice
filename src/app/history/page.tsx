import type { Metadata } from "next";
import StudyHistory from "./study-history";

export const metadata: Metadata = { title: "学习记录 | JLPT Practice", robots: { index: false, follow: false } };
export default function HistoryPage() { return <StudyHistory />; }
