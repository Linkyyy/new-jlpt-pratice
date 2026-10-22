"use client";

import {useEffect} from "react";

export default function PageError({retry}: {retry: () => void}) {
  useEffect(() => { window.dispatchEvent(new Event("jlpt:startup-failed")); }, []);
  return <main lang="zh-CN" style={{maxWidth:520,margin:"48px auto",padding:24,fontFamily:"Arial, sans-serif",lineHeight:1.8,color:"#0f172a",background:"#fff",borderRadius:16}}>
    <h1 style={{fontSize:24}}>页面暂时无法加载</h1>
    <p>请重试；如果仍然无法打开，可以运行连接检测并复制检测结果。</p>
    <div style={{display:"flex",flexWrap:"wrap",gap:16,alignItems:"center"}}>
      <button type="button" onClick={retry} style={{padding:"10px 18px",border:0,borderRadius:12,background:"#4f46e5",color:"white",fontSize:16,cursor:"pointer"}}>重试</button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Recovery must work without the failed client router. */}
      <a href="/" style={{color:"#4338ca"}}>返回首页</a>
      <a href="/connection-check.html" style={{color:"#4338ca"}}>连接检测</a>
    </div>
  </main>;
}
