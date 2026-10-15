"use client";

import { useI18n } from "@/lib/i18n";

export default function LocalizedText({ text }: { text: string }) {
  const { t } = useI18n();
  return t(text);
}
