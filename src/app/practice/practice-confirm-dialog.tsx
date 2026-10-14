import type { RefObject } from "react";

export type ConfirmationAction = "leave" | "restart" | "submit";

interface PracticeConfirmDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  action: ConfirmationAction | null;
  onConfirm: () => void;
  onClose: () => void;
  sessionLabel?: "练习" | "考试";
  unansweredCount?: number;
}

export default function PracticeConfirmDialog({
  dialogRef,
  action,
  onConfirm,
  onClose,
  sessionLabel = "练习",
  unansweredCount = 0,
}: PracticeConfirmDialogProps) {
  const restarting = action === "restart";
  const submitting = action === "submit";

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        // close 事件异步派发；快速重新打开时，不清空新弹窗的操作类型。
        if (!dialogRef.current?.open) onClose();
      }}
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <h2 id="confirmation-title" className="text-xl font-bold">{submitting ? "确认提交试卷？" : restarting ? `重新${sessionLabel}这份试卷？` : `离开当前${sessionLabel}？`}</h2>
      <p id="confirmation-description" className="mt-3 text-sm leading-7 text-slate-600">
        {submitting ? `${unansweredCount > 0 ? `还有 ${unansweredCount} 题未作答，将按未得分计算。` : "所有题目均已作答。"}交卷后所有答案都会锁定，无法修改。` : restarting ? `重新${sessionLabel}会清除本次答案和成绩，无法撤销。` : `返回首页后，本次答案和进度都会丢失。你可以继续完成这份${sessionLabel}。`}
      </p>
      <form method="dialog" className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button autoFocus className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{submitting ? "继续作答" : restarting ? "保留成绩" : `继续${sessionLabel}`}</button>
        <button type="button" onClick={onConfirm} className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{submitting ? "确认交卷" : restarting ? `确认重新${sessionLabel}` : "放弃并返回首页"}</button>
      </form>
    </dialog>
  );
}
