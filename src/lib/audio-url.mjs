const audioExtension = /\.(?:mp3|m4a|wav|ogg)$/i;

// Public playback domain supplied by the site owner. Upload credentials stay private.
export const defaultAudioBaseUrl = "https://pub-8ac2a059bee9443c839a7e7f2f350e93.r2.dev";

/** Preserve the source file mapping, including files shared by multiple questions. */
export function getAudioObjectKey(reference) {
  if (typeof reference !== "string") return null;
  const relative = reference.trim().replaceAll("\\", "/").replace(/^\/imported-media\//, "").replace(/^\.?\//, "");
  if (!relative.startsWith("audio/")) return null;
  try {
    const segments = relative.split("/").map(decodeURIComponent);
    if (segments.some((part) => !part || part === "." || part === ".." || /[\\/\x00-\x1f\x7f?#]/.test(part))) return null;
    const key = segments.join("/");
    return audioExtension.test(key) ? key : null;
  } catch { return null; }
}

export function isPublicAudioUrl(reference) {
  if (typeof reference !== "string") return false;
  try {
    const url = new URL(reference);
    return url.protocol === "https:" && !url.username && !url.password && audioExtension.test(url.pathname);
  } catch { return false; }
}

export function isAudioReference(reference) {
  return getAudioObjectKey(reference) !== null || isPublicAudioUrl(reference);
}

/** NEXT_PUBLIC_AUDIO_BASE_URL is public and fixed at next build time. No proxy. */
export function getAudioUrl(reference, baseUrl = process.env.NEXT_PUBLIC_AUDIO_BASE_URL || defaultAudioBaseUrl) {
  if (isPublicAudioUrl(reference)) return reference;
  const key = getAudioObjectKey(reference);
  if (!key) return null;
  // Keep existing local references usable during a legacy local development setup.
  if (!baseUrl && reference.startsWith("/imported-media/")) return reference;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) return null;
    return `${base.href.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  } catch { return null; }
}
