"use client";

import { LoadingDots } from "@/components/LoadingDots";


import { useEffect, useRef, useState } from "react";
import { loadNotificationSheet, markUpdatesSeen } from "@/app/actions/notifications";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { NotificationList, type Notif } from "@/components/UpdatesScreen";
import { loadClientMemory, readClientMemory } from "@/lib/client-memory";

const NOTIFICATIONS_MEMORY_KEY = "sheet:notifications";

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notif[] | null>(() =>
    readClientMemory<Notif[]>(NOTIFICATIONS_MEMORY_KEY),
  );
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    void markUpdatesSeen().then(()=>window.dispatchEvent(new Event("fl-notifications-seen"))).catch(()=>{});
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && sheet.current && document.activeElement?.closest('.sheet, [role="dialog"]') === sheet.current) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    void loadClientMemory(NOTIFICATIONS_MEMORY_KEY, loadNotificationSheet)
      .then((items) => {
        if (live && items !== null) {
          setNotifications(items);
          setFailed(false);
        }
      })
      .catch(() => {
        // Keep the last successful list visible if the refresh fails.
        if (live && notifications === null) setFailed(true);
      });
    return () => { live = false; };
  }, []);

  return (
    <BodyPortal>
      <div className="sheet-scrim notifications-sheet-scrim" onClick={(event) => event.target === event.currentTarget && onClose()}>
        <section ref={sheet} className="sheet utility-sheet notifications-sheet" role="dialog" aria-modal="true" aria-labelledby="notifications-sheet-title">
          <header className="utility-sheet-head">
            <span className="utility-sheet-grab" aria-hidden="true" />
            <h2 id="notifications-sheet-title">Notifications</h2>
            <button type="button" className="sheetclose sheet-dismiss" aria-label="Close notifications" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </header>
          <div className="utility-sheet-content">
            {notifications ? (
              <NotificationList notifications={notifications} />
            ) : failed ? (
              <div className="notifications-sheet-loading" role="status">Couldn&rsquo;t load notifications</div>
            ) : (
              <div className="notifications-sheet-loading" role="status"><LoadingDots label="Loading notifications"/></div>
            )}
          </div>
        </section>
      </div>
    </BodyPortal>
  );
}
