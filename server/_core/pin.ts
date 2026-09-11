import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export const PIN_PATTERN = /^\d{4,6}$/;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(pin, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const candidate = await scryptAsync(pin, salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;
const failures = new Map<number, { count: number; lockedUntil: number }>();

export function getLockRemainingMs(userId: number): number {
  const entry = failures.get(userId);
  if (!entry) return 0;
  return Math.max(0, entry.lockedUntil - Date.now());
}

/** Records a failed attempt and returns how many attempts remain before lockout (0 = now locked). */
export function recordPinFailure(userId: number): number {
  const entry = failures.get(userId) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCK_MS;
    entry.count = 0;
    failures.set(userId, entry);
    return 0;
  }
  failures.set(userId, entry);
  return MAX_ATTEMPTS - entry.count;
}

export function clearPinFailures(userId: number): void {
  failures.delete(userId);
}
