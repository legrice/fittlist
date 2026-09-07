"use client";

import { useEffect, useRef } from "react";
import { NotificationFeed } from "@/components/NotificationFeed";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { NotificationList } from "@/components/UpdatesScreen";

export function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const sheet = useRef<HTMLElement>(null);

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
            <NotificationFeed renderList={(notifications) => <NotificationList notifications={notifications} />} />
          </div>
        </section>
      </div>
    </BodyPortal>
  );
}
