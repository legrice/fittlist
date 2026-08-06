"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { myWeekText } from "@/app/actions/weektext";
import { Icon } from "@/components/Icon";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's sheet: every way of handing your page on, in one place.
//
// It is the profile's own share menu grown into a hub, opened from the bar
// rather than from your page, because sharing is the half of "build a
// calendar, share a calendar" the whole app is for and it should not take a
// trip to your profile to start. The rows are the same acts that menu offers:
// the picture editor, your link, your QR code, your card, your week as text.
//
// It stays mounted while a sub-sheet is up and comes back when one closes, so
// the QR code and the card open from here and return here: a hub you fall out
// of after every act is a menu, not a place. The toast lives here too, on the
// component that outlives the row that fired it.
export function ShareHub({
  coach,
  handle,
  onClose,
}: {
  /** A coach gets the schedule rows; a member's page has no week to draw. */
  coach: boolean;
  handle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<"menu" | "qr" | "card">("menu");
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
      {view === "menu" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet sharehub">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
            <h2>Share</h2>
            <div className="settingslist ownermenu">
              {coach && (
                <button
                  className="setrow"
                  onClick={() => {
                    onClose();
                    router.push("/share");
                  }}
                >
                  <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Share your schedule</span>
                    <span className="s">A picture of your week, made to post</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              )}
              <button className="setrow" onClick={copyLink}>
                <span className="setrow-ic"><Icon name="link" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your link</span>
                  <span className="s">Straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={() => setView("qr")}>
                <span className="setrow-ic"><Icon name="qr_code_2" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Your QR code</span>
                  <span className="s">A scannable code that opens your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={() => setView("card")}>
                <span className="setrow-ic"><Icon name="auto_awesome" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Your profile card</span>
                  <span className="s">A square image for a post</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {coach && (
                <button className="setrow" onClick={copyWeek}>
                  <span className="setrow-ic"><Icon name="content_copy" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Copy your week</span>
                    <span className="s">As text, ready to paste</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <QrSheet
        handle={handle}
        open={view === "qr"}
        onClose={() => setView("menu")}
        onToast={toast}
      />
      {view === "card" && (
        <ShareCardSheet
          path={`/api/card/${handle}`}
          fileName={`fittlist-${handle}-card.png`}
          title="Share your card"
          lead="A square image of your profile, made for a post or a story. Your page is one tap from the link on it."
          alt="Your profile card"
          onClose={() => setView("menu")}
          onToast={toast}
        />
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
