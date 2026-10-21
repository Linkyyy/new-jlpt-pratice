import LoadingSkeleton from "@/components/loading-skeleton";
import type { Metadata } from "next";
import { Suspense } from "react";
import FavoritePracticeClient from "./practice-client";
import { collectionView } from "../review-selection";

export const metadata: Metadata = { title: "收藏题练习 | JLPT Practice" };

async function FavoritePractice({ searchParams }: PageProps<"/favorites/practice">) {
  const params = await searchParams;
  return <FavoritePracticeClient key={typeof params.attempt === "string" ? params.attempt : "selection"} view={collectionView(params.view)} attemptId={typeof params.attempt === "string" ? params.attempt : undefined} fresh={params.fresh === "1"} folderId={typeof params.folder === "string" ? params.folder : "all"} category={typeof params.category === "string" ? params.category : "all"} level={typeof params.level === "string" ? params.level : "all"} questionId={typeof params.question === "string" ? params.question : undefined} />;
}

export default function FavoritePracticePage(props: PageProps<"/favorites/practice">) {
  return <Suspense fallback={<LoadingSkeleton label="正在准备收藏练习……" variant="question" fullPage />}><FavoritePractice {...props} /></Suspense>;
}
