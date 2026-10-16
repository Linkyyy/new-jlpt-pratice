"use client";

import { useI18n } from "@/lib/i18n";

interface NavigationSettingsProps {
  swipeEnabled: boolean;
  buttonsEnabled: boolean;
  keyboardEnabled: boolean;
  onSwipeChange: (enabled: boolean) => void;
  onButtonsChange: (enabled: boolean) => void;
  onKeyboardChange: (enabled: boolean) => void;
}

export default function NavigationSettings({ swipeEnabled, buttonsEnabled, keyboardEnabled, onSwipeChange, onButtonsChange, onKeyboardChange }: NavigationSettingsProps) {
  const { t } = useI18n();
  return (
    <fieldset className="mt-5 border-t border-slate-100 pt-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">{t("切题设置")}</legend>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="swipe-navigation" checked={swipeEnabled} onChange={(event) => onSwipeChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        {t("开启滑动切题")}</label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="button-navigation" checked={buttonsEnabled} onChange={(event) => onButtonsChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        {t("显示切题按钮")}</label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="keyboard-shortcuts" checked={keyboardEnabled} onChange={(event) => onKeyboardChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        {t("电脑答题快捷键")}</label>
      <p className="mt-1 text-xs leading-6 text-slate-500">{t("数字 1–4 选择，Enter 提交或继续，← / → 切题。输入文字或打开弹窗时不生效。")}</p>
      <p className="mt-2 text-xs leading-6 text-slate-500">{t("仅对本次作答生效，关闭后仍可点击题号切题。")}</p>
    </fieldset>
  );
}
