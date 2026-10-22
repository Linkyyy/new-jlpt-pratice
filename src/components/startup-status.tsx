"use client";

import {useEffect} from "react";

export default function StartupStatus() {
  useEffect(() => { window.dispatchEvent(new Event("jlpt:startup-ready")); }, []);
  return <>
    <aside id="app-startup-help" hidden suppressHydrationWarning role="status" style={{margin:16,padding:16,border:"1px solid #c7d2fe",borderRadius:16,background:"#eef2ff",color:"#312e81",fontFamily:"Arial, sans-serif",lineHeight:1.7}}>
      <strong>页面尚未完成加载</strong>
      <p>部分资源可能加载失败，可以重新打开，或运行连接检测。</p>
      <a href="" style={{marginRight:20,color:"#4338ca"}}>重新打开</a>
      <a href="/connection-check.html" style={{color:"#4338ca"}}>连接检测</a>
    </aside>
    <noscript><div style={{margin:16,padding:16,border:"1px solid #c7d2fe",borderRadius:16,lineHeight:1.7}}>请开启浏览器的 JavaScript 后重新打开网站。<a href="/connection-check.html">查看连接检测</a></div></noscript>
  </>;
}
