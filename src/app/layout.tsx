import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "./panels.css";
import "./themes.css";
import { displayBootScript } from "@/lib/display-boot";
import PopupPositioning from "@/components/popup-positioning";
import { DisplaySync } from "@/components/display-settings";
import {startupBootScript} from "@/lib/startup-check";
import StartupStatus from "@/components/startup-status";

export const metadata: Metadata = {
  title: "JLPT Practice",
  description: "原创日语能力考试模拟练习",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: displayBootScript }} /><script dangerouslySetInnerHTML={{__html: startupBootScript}} /></head>
      <body className="min-h-full flex flex-col"><StartupStatus /><Suspense fallback={null}><DisplaySync /></Suspense><PopupPositioning />{children}</body>
    </html>
  );
}
