"use client";

import { useEffect, useState, useTransition } from "react";
import { calendarPinState, toggleCalendarPin } from "@/app/actions/pins";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function CalendarPinButton({
  entityType,
  entityId,
  entityName,
  className = "calendar-pin-button",
}: {
  entityType: "person" | "studio";
  entityId: string;
  entityName?: string;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, , , toastFor] = useToast();
  useEffect(() => { calendarPinState(entityType, entityId).then(setPinned); }, [entityId, entityType]);
  return (
    <>
      <button
        type="button"
        className={`${className}${pinned ? " on" : ""}`}
        disabled={pending}
        aria-pressed={pinned}
        aria-label={pinned ? "Remove calendar from favorites" : "Favorite calendar"}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          start(async () => {
            const result = await toggleCalendarPin(entityType, entityId);
            if (!result.ok) {
              setPinned(!next);
              return;
            }
            setPinned(result.pinned);
            window.dispatchEvent(new Event("calendar-pins-changed"));
            if (result.pinned && entityType === "person" && entityName) {
              const firstName = entityName.trim().split(/\s+/)[0];
              toastFor(`${firstName} was added to your favorites.`, 3200);
            }
          });
        }}
      >
        <Icon name={pinned ? "star_filled" : "star"} size={23} />
      </button>
      <BodyPortal>
        <Toast msg={toastMsg} on={toastOn} />
      </BodyPortal>
    </>
  );
}
