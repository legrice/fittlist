"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { coachRequestPending, requestCoaching } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";

// A member asking to post their own classes. It used to be a switch they could
// flip themselves, and the switch is how ghost inventory got into the
// directory. It's an ask now: this files it, the admin answers it, and the
// answer arrives in Updates.
export function StartCoaching({ handle }: { handle: string | null }) {
  void handle;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pendingAsk, setPendingAsk] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let live = true;
    coachRequestPending().then((p) => live && setPendingAsk(p));
    return () => {
      live = false;
    };
  }, []);

  const send = () =>
    start(async () => {
      setErr("");
      const res = await requestCoaching(note);
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      setPendingAsk(true);
      setOpen(false);
    });

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="calendar_month" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">Become a coach</span>
          <span className="s">
            {pendingAsk ? "Asked. We'll be in touch" : "Post your own classes on your page"}
          </span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget && !busy) setOpen(false);
            }}
          >
            <div className="sheet">
              <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
                <Icon name="close" size={16} />
              </button>
              <h2>Become a coach</h2>
              {pendingAsk ? (
                <p className="lead">
                  You&rsquo;ve asked already, and it&rsquo;s in front of us. The answer lands in
                  your Updates; once you&rsquo;re approved, your page gets a schedule and you can
                  publish classes.
                </p>
              ) : (
                <>
                  <p className="lead">
                    Coaching on fittlist means the classes you publish are real ones you teach,
                    listed in the directory for anyone to find. We approve coaches by hand while
                    the app is in beta, usually the same day. Everything you have as a member
                    stays.
                  </p>
                  <label className="flabel" htmlFor="crNote">
                    Where do you coach? <span>· optional, helps us say yes faster</span>
                  </label>
                  <input
                    id="crNote"
                    type="text"
                    className="editinput"
                    maxLength={300}
                    placeholder="e.g. Kettlebell club at Ironbound, Tuesdays"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {err && (
                    <div className="errorcopy" style={{ textAlign: "left" }}>
                      {err}
                    </div>
                  )}
                  <div className="publishwrap nostick">
                    <button className="btn si" disabled={busy} onClick={send}>
                      {busy ? "Sending…" : "Ask to become a coach"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
