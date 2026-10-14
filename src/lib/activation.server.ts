import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ACTIVATION_CODE_DIGEST } from "./activation-code.server";

export const ACTIVATION_COOKIE = "jlpt_activation";
export const ACTIVATION_MAX_AGE = 60 * 60 * 24 * 30;

export function normalizeActivationCode(value: string): string {
  return value.trim().toUpperCase();
}

export function verifyActivationCode(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 100) return false;
  const digest = createHash("sha256").update(normalizeActivationCode(value)).digest();
  return timingSafeEqual(digest, Buffer.from(ACTIVATION_CODE_DIGEST, "hex"));
}

export async function isActivated(): Promise<boolean> {
  return verifyActivationCode((await cookies()).get(ACTIVATION_COOKIE)?.value);
}

export function practiceReturnPath(path: string, params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else value?.forEach((item) => search.append(key, item));
  }
  return search.size ? `${path}?${search}` : path;
}
