"use client";

import { useEffect, useRef } from "react";
import { markUpdatesSeen } from "@/app/actions/notifications";

/** Runs only after a list is displayed, including a cached list. Refreshes
 * the badge instead of assuming that no newer or undisplayed rows remain. */
export function MarkNotificationsSeen({ ids }: { ids: string[] }) {
  const acknowledged = useRef(new Set<string>());
  const idsKey = JSON.stringify(ids);
  useEffect(() => {
    let live = true;
    const pending = (JSON.parse(idsKey) as string[]).filter((id) => !acknowledged.current.has(id));
    const acknowledge = async () => {
      for (let offset = 0; offset < pending.length; offset += 50) {
        const batch = pending.slice(offset, offset + 50);
        await markUpdatesSeen(batch);
        batch.forEach((id) => acknowledged.current.add(id));
      }
    };
    void acknowledge().then(() => {
      if (live) window.dispatchEvent(new Event("fl-notifications-seen"));
    }).catch(() => {
      // Leave the badge intact; reopening retries the acknowledgement.
    });
    return () => { live = false; };
  }, [idsKey]);
  return null;
}
