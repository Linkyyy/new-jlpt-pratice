import { defaultAudioBaseUrl } from "./audio-url.mjs";

const imageExtension = /\.(?:png|jpe?g|webp|gif)$/i;

function safePath(reference) {
  if (typeof reference !== "string") return null;
  try {
    const parts = reference.trim().replaceAll("\\", "/").split("/").map(decodeURIComponent);
    if (parts.some(part => !part || part === "." || part === ".." || /[\\/\x00-\x1f\x7f?#]/.test(part))) return null;
    const key = parts.join("/");
    return imageExtension.test(key) ? key : null;
  } catch { return null; }
}

/** Preserve the original picture filename, including images shared by subquestions. */
export function getImageObjectKey(reference) {
  const key = safePath(reference);
  return key?.startsWith("pic/") ? key : null;
}

function localImage(reference) {
  return typeof reference === "string" && reference.startsWith("/imported-media/")
    && safePath(reference.slice("/imported-media/".length)) !== null;
}

export function isImageReference(reference) {
  return localImage(reference) || getImageObjectKey(reference) !== null;
}

/** Images use the same public R2 base as audio and are fetched directly by the browser. */
export function getImageUrl(reference, baseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL || defaultAudioBaseUrl) {
  if (localImage(reference)) return reference;
  const key = getImageObjectKey(reference);
  if (!key) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return `${base.href.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  } catch { return null; }
}
