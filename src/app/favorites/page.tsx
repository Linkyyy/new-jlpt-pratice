import type { Metadata } from "next";
import { Suspense } from "react";
import LoadingSkeleton from "@/components/loading-skeleton";
import { getQuestionCatalog } from "@/data/practice-papers";
import FavoritesClient from "./favorites-client";
import "./favorites.css";

export const metadata: Metadata = { title: "收藏与错题 | JLPT Practice" };

export default function FavoritesPage() {
  return <Suspense fallback={<LoadingSkeleton label="正在读取本地收藏……" fullPage />}><FavoritesClient catalog={getQuestionCatalog()} /></Suspense>;
}
