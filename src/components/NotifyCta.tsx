"use client";

import { useState, useTransition } from "react";
import { subscribe } from "@/app/actions/subscribe";
import { Toast, useToast } from "@/components/Toast";

// Rendered once inside the public hero. The hero button shows on desktop
// (.heronotify) and the fixed bottom bar on mobile (.notifybar) — one
// instance, shared state, both fixed elements escape the hero's layout.
export function NotifyCta({ trainerName, handle }: { trainerName: string; handle: string }) {
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const label = subscribed ? "You're on the list ✓" : "Email me when this changes";
  const onCta = () => {
    if (subscribed) {
      toast("You're already on the list");
      return;
    }
    setError("");
    setOpen(true);
  };

  const submit = () => {
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await subscribe(handle, email);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSubscribed(true);
      setOpen(false);
      toast(`You're on ${trainerName}'s list`);
    });
  };

  return (
    <>
      <button className={`btn heronotify ${subscribed ? "cloudghost" : "si"}`} onClick={onCta}>
        {label}
      </button>
      <div className="notifybar">
        <button className={`btn ${subscribed ? "ghost" : "si"}`} onClick={onCta}>
          {label}
        </button>
      </div>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet">
            <div className="grab" />
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              {trainerName}&rsquo;s list
            </div>
            <h2>Get an email when the schedule changes</h2>
            <p className="lead">
              New classes, time changes, cancellations. Nothing else, ever. Unsubscribe anytime.
            </p>
            <label className="flabel" htmlFor="ntEmail">
              Your email
            </label>
            <input
              type="email"
              id="ntEmail"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={{
                width: "100%",
                padding: 13,
                border: "1.5px solid var(--line)",
                borderRadius: 11,
                fontFamily: "inherit",
                fontSize: 15,
              }}
            />
            {error && (
              <p className="empty" style={{ paddingBottom: 0 }}>
                {error}
              </p>
            )}
            <div className="publishwrap">
              <button className="btn si" disabled={pending} onClick={submit}>
                {pending ? "Adding…" : "Add me to the list"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
