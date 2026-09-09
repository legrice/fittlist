"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadNotificationSheet } from "@/app/actions/notifications";
import { withTimeout } from "@/lib/async";
import { LoadingDots } from "@/components/LoadingDots";
import { MarkNotificationsSeen } from "@/components/MarkNotificationsSeen";
import type { Notif } from "@/components/UpdatesScreen";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

export type NotificationPage = Awaited<ReturnType<typeof loadNotificationSheet>>;
const MEMORY_KEY = "sheet:notifications:v2";

export function NotificationFeed({ initialPage, renderList }: {
  initialPage?: NotificationPage;
  renderList: (notifications: Notif[]) => ReactNode;
}) {
  const [page, setPage] = useState<NotificationPage | null>(() => initialPage ?? readClientMemory(MEMORY_KEY));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const loading = useRef(false);
  const retryMore = useRef(false);

  const load = async (more = false) => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const result = more && page?.nextCursor
        ? await withTimeout(loadNotificationSheet(page.nextCursor))
        : await loadClientMemory(MEMORY_KEY, loadNotificationSheet);
      if (mounted.current && result) setPage((current) => more && current ? {
        notifications: [...new Map([...current.notifications, ...result.notifications].map((item) => [item.id, item])).values()],
        nextCursor: result.nextCursor,
      } : result);
    } catch {
      retryMore.current = more;
      if (mounted.current) setFailed(true);
    } finally {
      loading.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    if (!initialPage) void load();
    return () => { mounted.current = false; };
  }, []);

  return <>
    {page && <>
      <MarkNotificationsSeen ids={page.notifications.filter((item) => !item.readAt).map((item) => item.id)} />
      {renderList(page.notifications)}
    </>}
    {!page && !failed && <div className="notifications-sheet-loading" role="status"><LoadingDots label="Loading notifications" /></div>}
    {failed && <div className="notifications-sheet-loading" role="status">Couldn&rsquo;t load notifications</div>}
    {(failed || page?.nextCursor) && <button
      type="button"
      className="follow-directory-more"
      disabled={busy}
      onClick={() => void load(failed ? retryMore.current : !!page?.nextCursor)}
    >{busy ? <LoadingDots label="Loading notifications" /> : failed ? "Try again" : "Load more"}</button>}
  </>;
}
