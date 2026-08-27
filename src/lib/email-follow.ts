import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const EMAIL_FOLLOW_PENDING_COOKIE = "fl_email_follow_pending";
export const EMAIL_FOLLOW_TTL_MS = 30 * 60 * 1000;
export const EMAIL_FOLLOW_TOKEN_RE = /^[a-f0-9]{64}$/;

export function emailFollowTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function pendingEmailFollowToken(): Promise<string | null> {
  const token = (await cookies()).get(EMAIL_FOLLOW_PENDING_COOKIE)?.value ?? "";
  return EMAIL_FOLLOW_TOKEN_RE.test(token) ? token : null;
}

export async function clearPendingEmailFollowToken(): Promise<void> {
  (await cookies()).set(EMAIL_FOLLOW_PENDING_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/follow",
  });
}
