import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Password hashing with Node's built-in scrypt: no native dependency, no build
// step. Stored as "salt:hash" (both hex). scrypt is deliberately slow, so a
// leaked hash is expensive to brute-force.

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 1024;

// A valid fixed scrypt record keeps missing/passwordless accounts on the same
// expensive verification path as an incorrect password, without hashing anew.
export const DUMMY_PASSWORD_HASH = `${"00".repeat(16)}:${"00".repeat(KEYLEN)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length > MAX_PASSWORD_LENGTH) {
    return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
