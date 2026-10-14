import type { Metadata } from "next";
import "./globals.css";
import "./panels.css";

export const metadata: Metadata = {
  title: "JLPT Practice",
  description: "原创日语能力考试模拟练习",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
