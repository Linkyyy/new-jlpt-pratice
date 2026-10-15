import LoadingSkeleton from "@/components/loading-skeleton";
import type { Metadata } from "next";
import StudyDetail from "./study-detail";
import { Suspense } from "react";

export const metadata: Metadata = { title: "作答详情 | JLPT Practice", robots: { index: false, follow: false } };
async function SelectedDetail({ params }: PageProps<"/history/[id]">) {
  const { id } = await params;
  return <StudyDetail id={id} />;
}
export default function HistoryDetailPage(props: PageProps<"/history/[id]">) {
  return <Suspense fallback={<LoadingSkeleton label="正在读取作答记录……" fullPage />}><SelectedDetail {...props} /></Suspense>;
}
