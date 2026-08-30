"use client";

import { useEffect, useState } from "react";
import { loadNotificationSheet } from "@/app/actions/notifications";
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
        <section className="sheet notifications-sheet" role="dialog" aria-modal="true" aria-labelledby="notifications-sheet-title">
          <span className="notifications-sheet-grab" aria-hidden="true" />
          <div className="notifications-sheet-head">
            <button type="button" className="iconbtn notifications-sheet-close" aria-label="Close notifications" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
            <div>
              <h2 id="notifications-sheet-title">Notifications</h2>
              <p>Calendar, badge, and account activity</p>
            </div>
          </div>
          {notifications ? (
            <NotificationList notifications={notifications} />
          ) : failed ? (
            <div className="notifications-sheet-loading" role="status">Couldn&rsquo;t load notifications</div>
          ) : (
            <div className="notifications-sheet-loading" role="status">Loading notifications</div>
          )}
        </section>
      </div>
    </BodyPortal>
  );
}
