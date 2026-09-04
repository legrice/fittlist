"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useToast(): [string, boolean, (msg: string) => void, () => void, (msg: string, durationMs: number) => void] {
  const [msg, setMsg] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFor = useCallback((m: string, durationMs: number) => {
    setMsg(m);
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setOn(false);
    }, durationMs);
  }, []);
  const show = useCallback((m: string) => showFor(m, 2600), [showFor]);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOn(false);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [msg, on, show, dismiss, showFor];
}

export function Toast({
  msg,
  on,
  action,
  dismiss,
}: {
  msg: string;
  on: boolean;
  /** One link riding the toast, like "See it" after a save: the note is
   *  transient, so the way to the thing it names has to be in it. */
  action?: { label: string; href: string } | null;
  /** A short acknowledgement that closes an explanatory toast without
   *  navigating away, such as the first time someone favorites a calendar. */
  dismiss?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div
      className={`toast${on ? " on" : ""}${action || dismiss ? " has-act" : ""}`}
      role="status"
      aria-live="polite"
      inert={!on}
    >
      <span className="toast-msg">{on ? msg : ""}</span>
      {action && (
        <a className="toast-act" href={action.href}>
          {action.label}
        </a>
      )}
      {dismiss && (
        <button className="toast-act" type="button" onClick={dismiss.onClick}>
          {dismiss.label}
        </button>
      )}
    </div>
  );
}
