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

export function Toast({
  msg,
  on,
  action,
}: {
  msg: string;
  on: boolean;
  /** One link riding the toast, like "See it" after a save: the note is
   *  transient, so the way to the thing it names has to be in it. */
  action?: { label: string; href: string } | null;
}) {
  return (
    <div
      className={`toast${on ? " on" : ""}${action ? " has-act" : ""}`}
      role="status"
      aria-live="polite"
    >
      {msg}
      {action && (
        <a className="toast-act" href={action.href}>
          {action.label}
        </a>
      )}
    </div>
  );
}
