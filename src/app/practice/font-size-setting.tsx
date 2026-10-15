"use client";

import { useI18n } from "@/lib/i18n";

interface FontSizeSettingProps {
  value: number;
  onChange: (value: number) => void;
}

export default function FontSizeSetting({ value, onChange }: FontSizeSettingProps) {
  const { t } = useI18n();
  return (
    <label className="block py-2">
      <span className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>{t("字体大小")}</span><output className="font-normal tabular-nums text-slate-500">{value}px</output>
      </span>
      <input type="range" min="14" max="28" step="1" value={value} aria-label={t("字体大小")} aria-valuetext={t(`${value} 像素`)}
        onChange={(event) => onChange(Number(event.target.value))} className="mt-1 block h-11 w-full accent-indigo-600" />
    </label>
  );
}
