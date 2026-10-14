import type { Metadata } from "next";
import { Suspense } from "react";
import ActivationForm from "@/components/activation-form";
import { isActivated, practiceReturnPath } from "@/lib/activation.server";
import FavoritePracticeClient from "./practice-client";

export const metadata: Metadata = { title: "收藏题练习 | JLPT Practice" };

async function FavoritePractice({ searchParams }: PageProps<"/favorites/practice">) {
  const params = await searchParams;
  if (!await isActivated()) return <ActivationForm returnTo={practiceReturnPath("/favorites/practice", params)} />;
  return <FavoritePracticeClient folderId={typeof params.folder === "string" ? params.folder : "all"} category={typeof params.category === "string" ? params.category : "all"} level={typeof params.level === "string" ? params.level : "all"} questionId={typeof params.question === "string" ? params.question : undefined} />;
}

export default function FavoritePracticePage(props: PageProps<"/favorites/practice">) {
  return <Suspense fallback={<p role="status" className="p-8">正在准备收藏练习……</p>}><FavoritePractice {...props} /></Suspense>;
}
