import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { sessionSecretRaw } from "@/lib/secret";

// AES-256-GCM at rest for secrets like Google refresh tokens. The key is
// derived from SESSION_SECRET so no new secret is needed. Format:
// base64(iv[12] || authTag[16] || ciphertext).

function key(): Buffer {
  const secret = sessionSecretRaw();
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
