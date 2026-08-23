"use client";

import { useEffect, useState, useTransition } from "react";
import { calendarPinState, toggleCalendarPin } from "@/app/actions/pins";
import { Icon } from "@/components/Icon";

export function CalendarPinButton({ entityType, entityId, className = "calendar-pin-button" }: { entityType: "person" | "studio"; entityId: string; className?: string }) {
  const [pinned, setPinned] = useState(false);
  const [pending, start] = useTransition();
  useEffect(() => { calendarPinState(entityType, entityId).then(setPinned); }, [entityId, entityType]);
  return <button type="button" className={`${className}${pinned ? " on" : ""}`} disabled={pending} aria-pressed={pinned} aria-label={pinned ? "Remove favorite" : "Favorite"} onClick={() => { const next=!pinned; setPinned(next); start(async()=>{const result=await toggleCalendarPin(entityType,entityId); if(!result.ok)setPinned(!next);}); }}><Icon name={pinned ? "star_filled" : "star"} size={23} /></button>;
}
