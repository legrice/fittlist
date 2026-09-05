"use client";

import { useEffect, useState } from "react";
import { myInvites } from "@/app/actions/invites";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The bottom of a studio's Coaches tab: "Know a coach who teaches here?"
// The directory fills in by word of mouth, and the person most likely to
// bring a coach in is somebody standing in their class. The share carries a
// line about why (your whole teaching week on one link), because a bare URL
// asks the friend to guess what it is.
export function InviteCoach({ studioName }: { studioName: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (open && !url) myInvites().then((r) => setUrl(r.url));
  }, [open, url]);

  const text = `Teach at ${studioName}? fittlist puts your whole teaching week on one link people can follow. This invite gets you in.`;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Invite copied, ready to paste");
    } catch {
      toast(url);
    }
    setOpen(false);
  };

  const share = async () => {
    if (!url) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "fittlist", text, url });
        setOpen(false);
        return;
      }
      await copy();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") await copy();
    }
  };

  return (
    <>
      <button type="button" className="tertiary knowcoach" onClick={() => setOpen(true)}>
        Know a coach who teaches here?
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={20} />
            </button>
            <h2>Invite a coach</h2>
            <p className="lead">
              Hand them your invite link and their schedule can live here too. The invite
              says why it&rsquo;s worth it: their whole teaching week on one link.
            </p>
            <div className="settingslist ownermenu">
              <button className="setrow" disabled={!url} onClick={share}>
                <span className="setrow-ic"><Icon name="reply" className="share-arrow-forward" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Share the invite</span>
                  <span className="s">Send it anywhere you message</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" disabled={!url} onClick={copy}>
                <span className="setrow-ic"><Icon name="content_copy" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy the invite</span>
                  <span className="s">The line and your link, ready to paste</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
