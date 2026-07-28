"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { inviteFriend, myInvites } from "@/app/actions/invites";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// A settings row that lets a beta user bring people in. Everyone in a closed
// beta knows someone who should be in it, and asking them to email us about it
// loses most of them.
export function InviteFriends() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [sent, setSent] = useState<{ email: string; joined: boolean }[]>([]);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => setMounted(true), []);

  // Load the count lazily — the row reads fine without it, and this keeps a
  // query off the schedule's render path.
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

  const unlimited = left === -1;
  const none = left === 0;
  const sub = unlimited
    ? "Send someone a beta invite"
    : left === null
      ? "Send someone a beta invite"
      : none
        ? "You've used all your invites for now"
        : `${left} invite${left === 1 ? "" : "s"} left`;

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
      setOpen(false);
      toast(`Invite sent to ${to}`);
    });

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

      {/* Portalled to the body on purpose. The account view is a positioned
          z-40 layer, so it traps its children's stacking — a sheet rendered
          inside it sits UNDER the z-45 tab bar, and its bottom button can't be
          tapped at all. */}
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
            <h2>Invite someone to the beta</h2>
            <p className="lead">
              {none
                ? "You've used all your invites for now. Tell us who else should be in and we'll open more up."
                : "They'll get an email with a link that sets up their page. Coaches get the most out of it, but anyone who wants to follow one is welcome."}
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
