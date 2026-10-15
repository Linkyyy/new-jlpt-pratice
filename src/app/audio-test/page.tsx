import type { Metadata } from "next";
import Link from "next/link";
import LocalizedText from "@/components/localized-text";
import AudioTestPlayer from "./audio-test-player";

export const metadata: Metadata = {
  title: "听力播放测试 | JLPT Practice",
  robots: { index: false, follow: false },
};

export default function AudioTestPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 font-sans text-slate-900 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600 hover:underline"><LocalizedText text="← 返回首页" /></Link>
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="audio-test-title">
          <p className="text-xs font-semibold tracking-widest text-indigo-600">JLPT Practice</p>
          <h1 id="audio-test-title" className="mt-3 text-2xl font-bold"><LocalizedText text="听力播放测试" /></h1>
          <p className="mt-3 text-sm leading-7 text-slate-600"><LocalizedText text="两段约 35 秒的合成英语语音，仅用于测试播放功能。点击播放后加载音频。" /></p>
          <AudioTestPlayer />
        </section>
        <p className="mt-5 text-sm leading-7 text-slate-500"><LocalizedText text="可以测试播放、暂停、拖动进度、音量和倍速。播放过程中切换音频，上一段会自动停止。测试不计入答题和成绩。" /></p>
      </div>
    </main>
  );
}
