import { createHash, timingSafeEqual } from 'node:crypto';
import { ACTIVATION_CODE_DIGEST } from './activation-code.server';

export const ACTIVATION_COOKIE = 'jlpt_activation';
export const ACTIVATION_MAX_AGE = 60 * 60 * 24 * 400;
// Opaque browser token, never the plaintext shared passphrase.
export function browserAccessToken() {
  return createHash('sha256').update(`jlpt-browser-access:v2:${ACTIVATION_CODE_DIGEST}`).digest('hex');
}
export function verifyBrowserAccessToken(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(browserAccessToken(), 'hex'));
}
