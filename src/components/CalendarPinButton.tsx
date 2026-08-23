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
  const [toastMsg, toastOn, , dismissToast, toastFor] = useToast();
  useEffect(() => { calendarPinState(entityType, entityId).then(setPinned); }, [entityId, entityType]);
  return (
    <>
      <button
        type="button"
        className={`${className}${pinned ? " on" : ""}`}
        disabled={pending}
        aria-pressed={pinned}
        aria-label={pinned ? "Remove favorite" : "Favorite"}
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
            if (result.pinned && entityType === "person" && entityName) {
              toastFor(`You favorited ${entityName}. Their calendar will appear near the front.`, 5200);
            }
          });
        }}
      >
        <Icon name={pinned ? "star_filled" : "star"} size={23} />
      </button>
      <BodyPortal>
        <Toast msg={toastMsg} on={toastOn} dismiss={{ label: "Great, thanks", onClick: dismissToast }} />
      </BodyPortal>
    </>
  );
}
