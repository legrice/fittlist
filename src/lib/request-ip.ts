import "server-only";

import { headers } from "next/headers";

/**
 * The deployment proxy supplies x-forwarded-for. Keep only the client hop and
 * cap malformed input before it is fed to the rate-limit HMAC. "unknown" is a
 * deliberately shared, fail-closed bucket when no proxy address is present.
 */
export async function requestIpAddress(): Promise<string> {
  const values = await headers();
  const forwarded = values.get("x-forwarded-for") ?? values.get("x-real-ip") ?? "unknown";
  return forwarded.split(",", 1)[0]?.trim().slice(0, 128) || "unknown";
}
