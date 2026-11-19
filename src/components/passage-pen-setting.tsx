"use client";

import { useI18n } from "@/lib/i18n";
import { setUserPreferences, useUserPreferences } from "@/lib/user-preferences";

export default function PassagePenSetting() {
  const { t } = useI18n();
  const { passagePenEnabled = true } = useUserPreferences().data.practice;
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
    <input type="checkbox" name="passage-pen" checked={passagePenEnabled}
      onChange={event => setUserPreferences("practice", { passagePenEnabled: event.target.checked })}
      className="h-4 w-4 shrink-0 accent-indigo-600" />
    {t("显示长文悬浮画笔")}
  </label>;
}
