interface NavigationSettingsProps {
  swipeEnabled: boolean;
  buttonsEnabled: boolean;
  onSwipeChange: (enabled: boolean) => void;
  onButtonsChange: (enabled: boolean) => void;
}

export default function NavigationSettings({ swipeEnabled, buttonsEnabled, onSwipeChange, onButtonsChange }: NavigationSettingsProps) {
  return (
    <fieldset className="mt-5 border-t border-slate-100 pt-4">
      <legend className="px-1 text-sm font-semibold text-slate-700">切题设置</legend>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="swipe-navigation" checked={swipeEnabled} onChange={(event) => onSwipeChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        开启滑动切题
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="button-navigation" checked={buttonsEnabled} onChange={(event) => onButtonsChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
        显示切题按钮
      </label>
      <p className="mt-2 text-xs leading-6 text-slate-500">仅对本次作答生效，关闭后仍可点击题号切题。</p>
    </fieldset>
  );
}
