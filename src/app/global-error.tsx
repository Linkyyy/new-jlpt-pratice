"use client";

import PageError from "@/components/page-error";

export default function GlobalError({retry}: {error: Error & {digest?: string}; retry: () => void}) {
  return <html lang="zh-CN"><body style={{margin:0,background:"#f8fafc"}}><PageError retry={retry} /></body></html>;
}
