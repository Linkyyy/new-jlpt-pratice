import { n1TranslationIndex, type PassageTranslation } from "@/data/passage-translation";
import n1Passages from "@/data/passage-translations/n1.zh.json";

const passages: readonly PassageTranslation[] = n1Passages;

export function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get("id");
  const index = questionId ? n1TranslationIndex(questionId) : undefined;
  const passage = index === undefined ? undefined : passages[index];
  return passage ? Response.json(passage) : new Response(null, { status: 404 });
}
