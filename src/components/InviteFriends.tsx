"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { myInvites, type JoinedPerson } from "@/app/actions/invites";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The invite sheet, on its own so more than one thing can open it: the settings
// row below, and the banner that tells people the row exists.
//
// One link, permanent, no email involved. Asking someone for their friend's
// address to invite them was a step nobody wanted to take on someone else's
// behalf, and it lost most of them. A link goes in a text, a story, a group
// chat, and the beta gate still holds: nobody gets in without one.
export function InviteSheet({
  onClose,
  onCopied,
}: {
  onClose: () => void;
  /** Fired when the link is copied. The confirmation lives with whoever opened
   *  the sheet: a toast rendered in here goes away with it and is never seen. */
  onCopied?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [people, setPeople] = useState<JoinedPerson[]>([]);
  const [mounted, setMounted] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  useEffect(() => {
    let live = true;
    myInvites().then((r) => {
      if (!live) return;
      setUrl(r.url);
      setPeople(r.people);
    });
    return () => {
      live = false;
    };
  }, []);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* a clipboard that says no still leaves the link on screen to select */
    }
    onCopied?.();
    onClose();
  };

  const share = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: "fittlist", text: "Sign up using this link", url });
      onClose();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") copy();
    }
  };

  const joined = people.filter((p) => p.joined);

  return (
    <>
      {/* Portalled to the body on purpose. The account view is a positioned
          z-40 layer, so it traps its children's stacking: a sheet rendered
          inside it sits UNDER the z-45 tab bar, and its bottom button can't be
          tapped at all. */}
      {mounted && createPortal(
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your invite link</h2>
            <p className="lead">
              Fittlist is invite-only while it&rsquo;s in beta. Anyone who opens this link can
              create an account: coaches get a page for their week, and anyone can follow along.
              Send it to as many people as you like.
            </p>

            <div className="joinlink">
              <span className="joinlink-url">{url || " "}</span>
            </div>

            <div className="publishwrap nostick">
              <button className="btn si" disabled={!url} onClick={canShare ? share : copy}>
                <Icon name="ios_share" size={18} /> {canShare ? "Share the link" : "Copy the link"}
              </button>
              {canShare && (
                <button
                  className="btn ghost"
                  style={{ marginTop: 8 }}
                  disabled={!url}
                  onClick={copy}
                >
                  Copy the link
                </button>
              )}
            </div>

            {joined.length > 0 && (
              <div className="invsent">
                <div className="invsent-h">
                  {joined.length === 1 ? "1 person joined" : `${joined.length} people joined`}
                </div>
                {joined.map((p, i) => (
                  <div key={`${p.who}-${i}`} className="invjoined">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="invjoined-av" src={p.photo} alt="" />
                    ) : (
                      <span
                        className="invjoined-av invjoined-av-empty"
                        style={{ background: p.color }}
                        aria-hidden="true"
                      >
                        {(p.who.trim().charAt(0) || "?").toUpperCase()}
                      </span>
                    )}
                    <span className="invjoined-nm">{p.who}</span>
                    {p.handle && <span className="invjoined-h">/{p.handle}</span>}
                  </div>
                ))}
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
  const [joined, setJoined] = useState<number | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

  // Load the count lazily: the row reads fine without it, and this keeps a
  // query off the schedule's render path.
  useEffect(() => {
    let live = true;
    myInvites().then((r) => live && setJoined(r.people.filter((p) => p.joined).length));
    return () => {
      live = false;
    };
  }, []);

  const sub =
    joined === null || joined === 0
      ? "Share your link and anyone can join"
      : joined === 1
        ? "1 person joined from your link"
        : `${joined} people joined from your link`;

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="groups" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">Invite people to the beta</span>
          <span className="s">{sub}</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>
      {open && (
        <InviteSheet onClose={() => setOpen(false)} onCopied={() => toast("Link copied, ready to paste")} />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
