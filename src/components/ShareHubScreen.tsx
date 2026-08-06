"use client";

import { useState } from "react";
import Link from "next/link";
import { myWeekText } from "@/app/actions/weektext";
import { Icon } from "@/components/Icon";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's own screen: every way of handing your page on, drawn as
// the thing it makes rather than a list of rows. It grew out of a sheet of
// setrows, by Matt's call: five rows saying five different acts in the same
// grey voice, when the acts make visibly different things. The card tile
// shows your card, the QR tile shows your code, and the week tile wears the
// one loud colour because a picture of your week is the act the whole app
// is for.
//
// The copies stay rows underneath: copying is an instant act with nothing
// to show, and a big tile for it would be a picture of nothing.
export function ShareHubScreen({
  coach,
  handle,
}: {
  /** A coach gets the week tile and the week-as-text row; a member's page
   *  has no schedule to draw. */
  coach: boolean;
  handle: string;
}) {
  const [card, setCard] = useState(false);
  const [qr, setQr] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
      toast("Link copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  const copyWeek = async () => {
    const res = await myWeekText();
    if (!res.ok || !res.text) {
      toast(res.error ?? "Couldn't copy that");
      return;
    }
    try {
      await navigator.clipboard.writeText(res.text);
      toast("Week copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  return (
    <>
      <div className="cardwrap">
        <div className="calbar">
          <h1 className="calbar-t">Share</h1>
        </div>

        <div className="shgrid">
          {coach && (
            <Link className="shtile shtile-lead" href="/share">
              <span className="shtile-ic" aria-hidden="true">
                <Icon name="auto_awesome" size={26} />
              </span>
              <span className="shtile-t">Your week</span>
              <span className="shtile-s">A picture of your schedule, made to post</span>
            </Link>
          )}
          {/* The previews are the real images the tiles hand on, drawn small:
              seeing the thing is what tells these apart at a glance. */}
          <button className="shtile" onClick={() => setCard(true)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="shtile-img" src={`/api/card/${handle}`} alt="" loading="lazy" />
            <span className="shtile-t">Profile card</span>
            <span className="shtile-s">A square image for a post</span>
          </button>
          <button className="shtile" onClick={() => setQr(true)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="shtile-img shtile-qr" src={`/api/qr/${handle}`} alt="" loading="lazy" />
            <span className="shtile-t">QR code</span>
            <span className="shtile-s">Scans straight to your page</span>
          </button>
        </div>

        <div className="settingslist shrows">
          <button className="setrow" onClick={copyLink}>
            <span className="setrow-ic"><Icon name="link" size={24} /></span>
            <span className="setrow-txt">
              <span className="t">Copy your link</span>
              <span className="s">fittlist.co/{handle}</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
          </button>
          {coach && (
            <button className="setrow" onClick={copyWeek}>
              <span className="setrow-ic"><Icon name="content_copy" size={24} /></span>
              <span className="setrow-txt">
                <span className="t">Copy your week as text</span>
                <span className="s">For the group chat, ready to paste</span>
              </span>
              <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
            </button>
          )}
        </div>
      </div>

      <QrSheet handle={handle} open={qr} onClose={() => setQr(false)} onToast={toast} />
      {card && (
        <ShareCardSheet
          path={`/api/card/${handle}`}
          fileName={`fittlist-${handle}-card.png`}
          title="Share your card"
          lead="A square image of your profile, made for a post or a story. Your page is one tap from the link on it."
          alt="Your profile card"
          onClose={() => setCard(false)}
          onToast={toast}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
