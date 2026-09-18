"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { sendUsage } from "@/lib/usage-client";
import type { UsageKind } from "@/lib/beta-analytics";
const sent = new Set<string>();
export function BetaUsage({ viewerId }: { viewerId: string }) {
  const path = usePathname();
  useEffect(() => {
    const record = () => {
      if (document.visibilityState !== "visible") return;
      const kinds: UsageKind[] = ["app_active"];
      if (path === "/calendar" || path === "/app") kinds.push("calendar_viewed");
      if (path === "/feed" || path.startsWith("/following") || path === "/discover" || path === "/search") kinds.push("explore_viewed");
      kinds.forEach(kind => {
        const key = `${viewerId}:${new Date().toISOString().slice(0, 10)}:${kind}`;
        if (!sent.has(key)) { sent.add(key); sendUsage(kind); }
      });
    };
    record();
    document.addEventListener("visibilitychange", record);
    const timer = setInterval(record, 300000);
    return () => { document.removeEventListener("visibilitychange", record); clearInterval(timer); };
  }, [viewerId, path]);
  return null;
}
