"use client";
import type { UsageKind } from "@/lib/beta-analytics";
export function sendUsage(kind: UsageKind) {
  void fetch("/api/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => {});
}
