"use client";

import { useCallback } from "react";
import { useDisplayPreferences } from "../display-preferences";
import { translate } from "./translate";

export function useI18n() {
  const { locale } = useDisplayPreferences();
  const t = useCallback((source: string | number | boolean | null | undefined, params?: Readonly<Record<string, string | number>>) => translate(source, locale, params), [locale]);
  return { t, locale };
}
