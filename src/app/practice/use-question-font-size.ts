"use client";

import { useState, useSyncExternalStore } from "react";
import type { StudyAttempt } from "@/lib/study-store";

const query = "(max-width: 1023px)";
function subscribe(listener: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

export function useQuestionFontSize(attempt: StudyAttempt) {
  const mobile = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const [desktopSize, setDesktopSize] = useState(attempt.fontSize);
  const [mobileSize, setMobileSize] = useState(attempt.mobileFontSize ?? 16);
  return {
    fontSize: mobile ? mobileSize : desktopSize,
    setFontSize: mobile ? setMobileSize : setDesktopSize,
    savedFontSizes: { fontSize: desktopSize, mobileFontSize: mobileSize },
  };
}
