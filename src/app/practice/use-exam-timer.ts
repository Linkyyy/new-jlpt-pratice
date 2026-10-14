"use client";

import { useEffect, useEffectEvent, useState } from "react";

export function useExamTimer(durationSeconds: number, onExpire: () => void) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(durationSeconds);
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    if (deadline === null) return;
    function updateTime() {
      const remaining = Math.max(0, Math.ceil(((deadline ?? 0) - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) expire();
    }
    const interval = window.setInterval(updateTime, 1000);
    document.addEventListener("visibilitychange", updateTime);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateTime);
    };
  }, [deadline]);

  function start() {
    setRemainingSeconds(durationSeconds);
    setDeadline(Date.now() + durationSeconds * 1000);
  }

  function stop(): number {
    const remaining = deadline === null ? remainingSeconds : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setRemainingSeconds(remaining);
    setDeadline(null);
    return durationSeconds - remaining;
  }

  function reset() {
    setDeadline(null);
    setRemainingSeconds(durationSeconds);
  }

  return { deadline, remainingSeconds, start, stop, reset };
}
