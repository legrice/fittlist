"use client";

import { useEffect, useState } from "react";
import { loadNotificationSheet } from "@/app/actions/notifications";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { NotificationList, type Notif } from "@/components/UpdatesScreen";

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notif[] | null>(null);

  useEffect(() => {
    let live = true;
    loadNotificationSheet().then((items) => {
      if (live) setNotifications(items);
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
          {notifications ? <NotificationList notifications={notifications} /> : <div className="notifications-sheet-loading" role="status">Loading notifications</div>}
        </section>
      </div>
    </BodyPortal>
  );
}
