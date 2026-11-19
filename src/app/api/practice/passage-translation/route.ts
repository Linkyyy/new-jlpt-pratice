import { passageTranslationLocation, type PassageTranslation } from "@/data/passage-translation";
import { passageSentences } from "@/data/passage-sentences";
import n1Passages from "@/data/passage-translations/n1.zh.json";
import n2Passages from "@/data/passage-translations/n2.zh.json";
import n3Passages from "@/data/passage-translations/n3.zh.json";

const passages: Record<"N1" | "N2" | "N3", readonly PassageTranslation[]> = { N1: n1Passages, N2: n2Passages, N3: n3Passages };

export function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get("id");
  const location = questionId ? passageTranslationLocation(questionId) : undefined;
  const passage = location && passages[location.level][location.position];
  return passage ? Response.json({ ...passage, sentences: passageSentences(passage) }) : new Response(null, { status: 404 });
}
