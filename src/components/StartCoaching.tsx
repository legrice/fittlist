"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { startCoaching } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

// A member deciding to post their own classes. They already picked a name and
// a link when they signed up, so there's nothing left to ask: this says what
// changes and does it. Everything they've built as a member, who they follow
// and the classes they marked Going, stays exactly where it is.
export function StartCoaching({ handle }: { handle: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => setMounted(true), []);

  const go = () =>
    start(async () => {
      setErr("");
      const res = await startCoaching();
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      router.push("/app");
      router.refresh();
    });

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="calendar_month" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">Post your own classes</span>
          <span className="s">Add a schedule to the page you already have</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>

      {/* Portalled: the account view traps stacking under the tab bar. */}
      {open && mounted && createPortal(
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Post your own classes</h2>
            <p className="lead">
              A Schedule tab appears at the bottom of the app, and that&rsquo;s where you add the
              classes you teach. They show up on the page you already have
              {handle ? `, at fittlist.co/${handle}` : ""}.
            </p>
            <p className="lead">
              Nothing else changes. The coaches you follow and the classes you marked Going stay
              exactly where they are.
            </p>
            {err && (
              <div className="errorcopy" style={{ textAlign: "left" }}>
                {err}
              </div>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={go}>
                {pending ? "One sec…" : "Add my Schedule tab"}
              </button>
              <button
                className="tertiary"
                style={{ display: "block", margin: "10px auto 0" }}
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
