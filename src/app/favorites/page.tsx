import type { Metadata } from "next";
import { getQuestionCatalog } from "@/data/practice-papers";
import FavoritesClient from "./favorites-client";

export const metadata: Metadata = { title: "我的收藏 | JLPT Practice" };

export default function FavoritesPage() {
  return <FavoritesClient catalog={getQuestionCatalog()} />;
}
