"use client";

import { useEffect, useRef, useState } from "react";
import { motionDuration } from "@/lib/motion";

/** Keep the schedule mounted for its exit before restoring the front sheet. */
export function useCalendarReturn(scheduleOpen: boolean, onRestore: () => void) {
  const [returning, setReturning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    if (scheduleOpen) setRestoring(false);
  }, [scheduleOpen]);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const restore = () => {
    if (!scheduleOpen || timer.current !== null) return;
    const finish = () => {
      timer.current = null;
      setReturning(false);
      setRestoring(true);
      restoreRef.current();
    };
    const duration = motionDuration("state");
    if (duration === 0) { finish(); return; }
    setReturning(true);
    timer.current = setTimeout(finish, duration);
  };

  return { returning, restoring, restore };
}
