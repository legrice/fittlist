"use client";

import { useCallback, useRef, useState } from "react";

export function useToast(): [string, boolean, (msg: string) => void] {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2600);
  }, []);
  return [msg, on, show];
}

export function Toast({ msg, on }: { msg: string; on: boolean }) {
  return (
    <div className={`toast${on ? " on" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
