"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NotificationsSheet } from "@/components/NotificationsSheet";

export function TabPageHeader({ notificationUnread = 0 }: { notificationUnread?: number }) {
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const calendar = pathname.startsWith("/feed");
  const discover = pathname.startsWith("/discover");

  if (!calendar && !discover) return null;

  return (
    <>
      <header className="tab-page-header">
        <h1>{calendar ? "Calendar" : "Discover"}</h1>
        {calendar && (
          <button
            type="button"
            className="tab-page-notifications"
            aria-label={notificationUnread > 0 ? `${notificationUnread} unread notifications` : "Notifications"}
            onClick={() => setNotificationsOpen(true)}
          >
            <Icon name="notifications" size={23} />
            {notificationUnread > 0 && <i aria-hidden="true" />}
          </button>
        )}
      </header>
      {notificationsOpen && <NotificationsSheet onClose={() => setNotificationsOpen(false)} />}
    </>
  );
}
