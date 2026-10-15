"use client";

export type BackupInfo = { revision: string; savedAt: number; bytes: number };
export type CloudState = { configured: boolean; user: { username: string } | null; backup: BackupInfo | null };
export class CloudRequestError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export async function requestCloudBackup(path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`/api/cloud-backup${path}`, { method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new CloudRequestError(response.status, result.error ?? "云服务暂时不可用，请稍后重试。");
  return result;
}
