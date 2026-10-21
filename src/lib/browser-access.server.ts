import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ACTIVATION_CODE_DIGEST } from './activation-code.server';

export const ACTIVATION_COOKIE = 'jlpt_activation';
export const ACTIVATION_MAX_AGE = 60 * 60 * 24 * 400;
// Configure ACCESS_TOKEN_SECRET to prevent deriving a token from the public code digest.
// Changing the secret invalidates remembered visits; it must be identical across instances.
export function browserAccessToken() {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (secret !== undefined) {
    if (secret.trim().length < 32) throw new Error('ACCESS_TOKEN_SECRET must contain at least 32 characters');
    return createHmac('sha256', secret).update(`jlpt-browser-access:v3:${ACTIVATION_CODE_DIGEST}`).digest('hex');
  }
  return createHash('sha256').update(`jlpt-browser-access:v2:${ACTIVATION_CODE_DIGEST}`).digest('hex');
}
export function verifyBrowserAccessToken(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(browserAccessToken(), 'hex'));
}
