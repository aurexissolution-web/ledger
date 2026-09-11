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
