export default function ReviewToolbar({ onReturn }: { onReturn: () => void }) {
  return (
    <section aria-label="题目复习" className="session-review">
      <div><h2 className="font-bold">题目复习</h2><p className="mt-1 text-xs text-slate-500">查看原答案与解析，作答记录已锁定</p></div>
      <button type="button" onClick={onReturn} className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">返回结算</button>
    </section>
  );
}
