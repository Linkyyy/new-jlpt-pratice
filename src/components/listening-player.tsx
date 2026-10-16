"use client";

import { useI18n } from "@/lib/i18n";

import { useEffect, useId, useRef, useState } from "react";
import { getAudioUrl } from "@/lib/audio-url.mjs";
import { setUserPreferences, useUserPreferences } from "@/lib/user-preferences";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export default function ListeningPlayer({ reference, questionId }: { reference: string; questionId: string }) {
  const url = getAudioUrl(reference);
  // A shared listening drawer passes its group ID to keep playback between subquestions.
  // Navigating to a different question/group remounts and pauses the previous audio.
  return <AudioControls key={`${questionId}:${url}`} url={url} />;
}

function AudioControls({ url }: { url: string | null }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const id = useId();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const preferences = useUserPreferences();
  const rate = preferences.data.practice.playbackRate;
  useEffect(() => {
    if (audioRef.current) { audioRef.current.defaultPlaybackRate = rate; audioRef.current.playbackRate = rate; }
  }, [rate]);

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
        : "音频未找到或加载失败，请重试。");
    }
  }

  function failed() {
    if (!mounted.current) return;
    setPlaying(false);
    setLoading(false);
    setError("音频未找到或加载失败，请重试。");
  }

  const ready = Number.isFinite(duration) && duration > 0;
  return (
    <section aria-label={t("听力播放器")} className="mt-5">
      {url ? <>
        <audio ref={audioRef} preload="none" aria-label={t("本题听力音频")}
          onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setLoading(false); }}
          onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)}
          onEnded={() => { setPlaying(false); setLoading(false); }} onError={failed}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} />
        <div className="flex h-12 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 sm:gap-3 sm:px-3">
          <button type="button" aria-label={t(playing ? "暂停听力" : "播放听力")} aria-pressed={playing}
            onClick={() => { if (playing) audioRef.current?.pause(); else void play(Boolean(error)); }}
            title={t(playing ? "暂停" : "播放")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            {loading ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 animate-spin fill-none stroke-current" strokeWidth="2"><path d="M20 12a8 8 0 1 1-8-8" /></svg>
              : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d={playing ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M8 5v14l11-7z"} /></svg>}
          </button>
          <label htmlFor={`${id}-seek`} className="sr-only">{t("听力进度")}</label>
            <input id={`${id}-seek`} type="range" min="0" max={ready ? duration : 1} step="0.1" value={ready ? Math.min(position, duration) : 0} disabled={!ready || Boolean(error)}
              aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
              onChange={(event) => { const audio = audioRef.current; if (audio && ready) { audio.currentTime = Number(event.target.value); setPosition(audio.currentTime); } }}
              className="h-9 min-w-0 flex-1 accent-indigo-600 disabled:opacity-40" />
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-slate-500 sm:text-xs">{formatTime(position)} / {formatTime(duration)}</span>
          <select value={rate} aria-label={t("听力播放速度")} onChange={(event) => { setUserPreferences("practice", { playbackRate: Number(event.target.value) }); }} className="h-9 w-14 shrink-0 rounded-lg bg-transparent pl-1 text-xs text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600 sm:w-16 sm:text-sm">
              {[.75, 1, 1.25, 1.5].map((value) => <option key={value} value={value}>{value}x</option>)}
            </select>
        </div>
        <span role="status" className="sr-only">{t(loading ? "音频加载中" : playing ? "正在播放" : "已暂停")}</span>
        {error && <div role="alert" className="mt-2 flex items-center gap-2 text-xs leading-6 text-rose-700">
          <p>{t(error)}</p><button type="button" aria-label={t("重试音频")} title={t("重试音频")} onClick={() => void play(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-600"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" /></svg></button>
        </div>}
      </> : <p role="alert" className="mt-2 text-sm text-rose-700">{t("本题音频地址尚未配置，请联系管理员。")}</p>}
      {preferences.error && <p role="alert" className="mt-2 text-xs text-amber-800">{t(preferences.error)}</p>}
    </section>
  );
}
