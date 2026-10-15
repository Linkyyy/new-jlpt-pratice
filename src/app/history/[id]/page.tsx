import type { Metadata } from "next";
import StudyDetail from "./study-detail";
import { Suspense } from "react";

export const metadata: Metadata = { title: "作答详情 | JLPT Practice", robots: { index: false, follow: false } };
async function SelectedDetail({ params }: PageProps<"/history/[id]">) {
  const { id } = await params;
  return <StudyDetail id={id} />;
}
export default function HistoryDetailPage(props: PageProps<"/history/[id]">) {
  return <Suspense fallback={<p role="status" className="p-8">正在读取作答记录……</p>}><SelectedDetail {...props} /></Suspense>;
}
