"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { changeHandle, handleStatus } from "@/app/actions/profile";
import { slug } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// A settings row for the one field people ask about most: their address.
//
// Once per 90 days. A handle is a thing people print on QR codes and paste in
// bios, and an address that keeps moving breaks every copy out there, so the
// sheet says exactly that before anyone commits. The old link 404s the moment
// the change lands; there is no quiet forwarding.
export function ChangeHandle() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Re-checked every time the sheet opens, not once on mount: the lock starts
  // the moment a change lands, and the row lives on a screen that stays up.
  useEffect(() => {
    let live = true;
    handleStatus().then((r) => {
      if (!live) return;
      setHandle(r.handle);
      setLockedUntil(r.lockedUntil);
    });
    return () => {
      live = false;
    };
  }, [open]);

  if (!handle) return null;
  const locked = !!lockedUntil;
  const preview = slug(next.trim());

  const save = () => {
    if (pending || !next.trim()) return;
    setErr("");
    start(async () => {
      const res = await changeHandle(next);
      if (!res.ok) {
        setErr(res.error ?? "Couldn't change that");
        return;
      }
      setHandle(res.handle ?? null);
      setOpen(false);
      setNext("");
      toast(`Your link is fittlist.co/${res.handle} now`);
      router.refresh();
    });
  };

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="link" size={24} />
        </span>
        <span className="setrow-txt">
          {/* "Handle" is what people call it: the row under it already
              shows the whole link, so the label naming the same thing again
              was a heading that repeated its own value. */}
          <span className="t">Handle</span>
          <span className="s">fittlist.co/{handle}</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={22} />
        </span>
      </button>
      {/* Portalled to the body, same reason as InviteFriends: this row lives
          inside the z-40 account layer, and a sheet rendered in place sits
          UNDER the z-45 tab bar, with its bottom button trapped behind it. */}
      {open && mounted && createPortal(
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={20} />
            </button>
            <h2>Change your handle</h2>
            {locked ? (
              <p className="lead">
                You changed your handle recently, so it&rsquo;s settled for now. You can change it
                again on {new Date(`${lockedUntil}T00:00:00Z`).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}.
              </p>
            ) : (
              <>
                <p className="lead">
                  Your link is the address on every QR code, bio and message you&rsquo;ve ever
                  shared. Change it and the old one stops working immediately; there&rsquo;s no
                  forwarding. You can do this once every 90 days.
                </p>
                <label className="flabel" htmlFor="chHandle">
                  New handle
                </label>
                <div className="editprefix editprefix-url">
                  <span className="editprefix-at">fittlist.co/</span>
                  <input
                    id="chHandle"
                    type="text"
                    className="editinput"
                    maxLength={40}
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder={handle}
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && save()}
                  />
                </div>
                {preview && preview !== next.trim() && (
                  <p className="adminsub">It becomes fittlist.co/{preview}</p>
                )}
                {err && (
                  <div className="errorcopy" style={{ textAlign: "left" }}>
                    {err}
                  </div>
                )}
                <div className="publishwrap nostick">
                  <button className="btn si" disabled={pending || !next.trim()} onClick={save}>
                    {pending ? "Changing…" : "Change my link"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
