"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { inviteFriend, myInvites } from "@/app/actions/invites";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The invite sheet, on its own so more than one thing can open it: the settings
// row below, and the banner that tells people the row exists.
export function InviteSheet({
  onClose,
  onSent,
}: {
  onClose: () => void;
  /** Fired before the sheet closes. The confirmation lives with whoever opened
   *  it: a toast rendered in here goes away with the sheet and is never seen. */
  onSent?: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [sent, setSent] = useState<{ email: string; joined: boolean }[]>([]);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let live = true;
    myInvites().then((r) => {
      if (!live) return;
      setLeft(Number.isFinite(r.left) ? r.left : -1);
      setSent(r.sent);
    });
    return () => {
      live = false;
    };
  }, []);

  const none = left === 0;

  const send = () =>
    start(async () => {
      setErr("");
      const res = await inviteFriend(email, note);
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      const to = email.trim().toLowerCase();
      setSent((s) => [{ email: to, joined: false }, ...s]);
      setLeft(res.left !== undefined && Number.isFinite(res.left) ? res.left! : left);
      setEmail("");
      setNote("");
      onSent?.(to);
      onClose();
    });

  return (
    <>
      {/* Portalled to the body on purpose. The account view is a positioned
          z-40 layer, so it traps its children's stacking — a sheet rendered
          inside it sits UNDER the z-45 tab bar, and its bottom button can't be
          tapped at all. */}
      {mounted && createPortal(
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) onClose();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Invite someone to the beta</h2>
            <p className="lead">
              {none
                ? "You've used all your invites for now. Tell us who else should be in and we'll open more up."
                : "They'll get an email with a link to create their page. Coaches can create and share their schedules, and anyone can follow along."}
            </p>
            <label className="flabel" htmlFor="ivEmail">
              Their email
            </label>
            <input
              type="email"
              id="ivEmail"
              className="editinput"
              placeholder="them@example.com"
              autoComplete="off"
              autoCapitalize="none"
              disabled={none}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <label className="flabel" htmlFor="ivNote">
              Who are they? <span>· optional, only we see this</span>
            </label>
            <input
              type="text"
              id="ivNote"
              className="editinput"
              placeholder="Coaches at Ironbound"
              disabled={none}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            {err && (
              <div className="errorcopy" style={{ textAlign: "left" }}>
                {err}
              </div>
            )}
            {sent.length > 0 && (
              <div className="invsent">
                <div className="invsent-h">You&rsquo;ve invited</div>
                {sent.map((s) => (
                  <div key={s.email} className="invsent-row">
                    <span className="e">{s.email}</span>
                    <span className={`invsent-tag${s.joined ? " on" : ""}`}>
                      {s.joined ? "joined" : "pending"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!none && (
              <div className="publishwrap nostick">
                <button className="btn si" disabled={pending || !email.trim()} onClick={send}>
                  {pending ? "Sending…" : "Send the invite"}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// A settings row that lets a beta user bring people in. Everyone in a closed
// beta knows someone who should be in it, and asking them to email us about it
// loses most of them.
export function InviteFriends() {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

  // Load the count lazily — the row reads fine without it, and this keeps a
  // query off the schedule's render path.
  useEffect(() => {
    let live = true;
    myInvites().then((r) => live && setLeft(Number.isFinite(r.left) ? r.left : -1));
    return () => {
      live = false;
    };
  }, []);

  const sub =
    left === null || left === -1
      ? "Send someone a beta invite"
      : left === 0
        ? "You've used all your invites for now"
        : `${left} invite${left === 1 ? "" : "s"} left`;

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="groups" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">Invite someone to the beta</span>
          <span className="s">{sub}</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>
      {open && (
        <InviteSheet
          onClose={() => setOpen(false)}
          onSent={(to) => {
            setLeft((n) => (typeof n === "number" && n > 0 ? n - 1 : n));
            toast(`Invite sent to ${to}`);
          }}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
