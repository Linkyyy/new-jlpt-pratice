"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getAudioUrl } from "@/lib/audio-url.mjs";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export default function ListeningPlayer({ reference, questionId }: { reference: string; questionId: string }) {
  const url = getAudioUrl(reference);
  // Remount even when two questions share one recording: stop the previous question.
  return <AudioControls key={`${questionId}:${url}`} url={url} />;
}

function AudioControls({ url }: { url: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    if (audio && url) audio.src = url;
    return () => {
      mounted.current = false;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    };
  }, [url]);

  async function play(retry = false) {
    const audio = audioRef.current;
    if (!audio || !url) return;
    setError(null);
    setLoading(true);
    if (retry) audio.load();
    audio.playbackRate = rate;
    try { await audio.play(); }
    catch (failure) {
      if (!mounted.current || failure instanceof DOMException && failure.name === "AbortError") return;
      setLoading(false);
      setPlaying(false);
      setError(failure instanceof DOMException && failure.name === "NotAllowedError"
        ? "浏览器暂未允许播放，请点击重试。"
        : "音频加载或播放失败，请检查网络后重试。");
    }
  }

  function failed() {
    if (!mounted.current) return;
    setPlaying(false);
    setLoading(false);
    setError("音频加载失败，请检查网络或稍后重试。");
  }

  const ready = Number.isFinite(duration) && duration > 0;
  return (
    <section aria-label="听力播放器" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold">听力音频</p>
      {url ? <>
        <audio ref={audioRef} preload="none" aria-label="本题听力音频"
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setLoading(false); }}
          onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)}
          onEnded={() => { setPlaying(false); setLoading(false); }} onError={failed}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" aria-label={playing ? "暂停听力" : "播放听力"} aria-pressed={playing}
            onClick={() => { if (playing) audioRef.current?.pause(); else void play(Boolean(error)); }}
            className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            {playing ? "暂停" : "播放"}
          </button>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-seek`} className="sr-only">听力进度</label>
            <input id={`${id}-seek`} type="range" min="0" max={ready ? duration : 1} step="0.1" value={ready ? Math.min(position, duration) : 0} disabled={!ready || Boolean(error)}
              aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
              onChange={(event) => { const audio = audioRef.current; if (audio && ready) { audio.currentTime = Number(event.target.value); setPosition(audio.currentTime); } }}
              className="block h-8 w-full accent-indigo-600 disabled:opacity-40" />
            <p className="text-right text-xs tabular-nums text-slate-500">{formatTime(position)} / {formatTime(duration)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <label className="flex min-h-11 items-center gap-2 text-sm text-slate-600">音量
            <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="听力音量" aria-describedby={`${id}-volume-help`} aria-valuetext={`${Math.round(volume * 100)}%`}
              onChange={(event) => { const audio = audioRef.current; if (audio) { audio.volume = Number(event.target.value); setVolume(audio.volume); } }} className="h-8 w-24 accent-indigo-600" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">倍速
            <select value={rate} aria-label="听力播放速度" onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.playbackRate = next; setRate(next); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900">
              {[.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
          </label>
        </div>
        <p role="status" className="mt-1 text-xs leading-5 text-slate-500">{loading ? "音频加载中…" : playing ? "正在播放 · 切换题目会自动暂停。" : "按需加载 · 点击播放，切题自动暂停。"}</p>
        <p id={`${id}-volume-help`} className="mt-1 text-xs leading-5 text-slate-500 sm:hidden">手机如无法调节音量，请使用设备音量键。</p>
        {error && <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <p>{error}</p><button type="button" onClick={() => void play(true)} className="min-h-11 rounded-lg border border-rose-200 bg-white px-3 font-semibold">重试音频</button>
        </div>}
      </> : <p role="alert" className="mt-2 text-sm text-rose-700">本题音频地址尚未配置，请联系管理员。</p>}
    </section>
  );
}
