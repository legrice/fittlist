"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { StudioOwnerBar, type StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

// The studio page's three dots: everything you can do with a studio, in one
// place. Share for anyone, Suggest an edit for anyone (the owner probably
// has no account), Report for the signed in, and Edit for coaches, behind a
// word about care: the directory is shared, so an edit lands on everyone.
export function StudioMenu({
  slug,
  canEdit,
  claimed,
  signedIn,
  studio,
}: {
  slug: string;
  canEdit: boolean;
  /** The studio runs its own page, so a suggestion goes to them, not to us. */
  claimed: boolean;
  signedIn: boolean;
  studio: StudioEditProps;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mindfulOpen, setMindfulOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<null | "report" | "suggest" | "optout">(null);
  const [toastMsg, toastOn, toast] = useToast();

  const share = async () => {
    setMenuOpen(false);
    const url = `${window.location.origin}/s/${slug}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${studio.name} on fittlist`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  return (
    <>
      <button className="ownermore" aria-label="More" onClick={() => setMenuOpen(true)}>
        <Icon name="more_horiz" size={20} />
      </button>

      {menuOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMenuOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2 style={{ marginTop: 10 }}>{studio.name}</h2>
            {/* settingslist, not a bare list: it is what carries the dividers
                between rows and the flush left edge, so the icons line up
                under the studio's name like every other button sheet. */}
            <div className="settingslist ownermenu">
              <button className="setrow" onClick={share}>
                <span className="setrow-ic"><Icon name="ios_share" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Share this studio</span>
                  <span className="s">Hand its page to someone</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              {canEdit && (
                <button
                  className="setrow"
                  onClick={() => {
                    setMenuOpen(false);
                    setMindfulOpen(true);
                  }}
                >
                  <span className="setrow-ic"><Icon name="edit" size={22} /></span>
                  <span className="setrow-txt">
                    <span className="t">Edit studio</span>
                    <span className="s">Fix or fill in its details</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
                </button>
              )}
              <button
                className="setrow"
                onClick={() => {
                  setMenuOpen(false);
                  setFeedback("suggest");
                }}
              >
                <span className="setrow-ic"><Icon name="chat_bubble" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Suggest an edit</span>
                  <span className="s">
                    {claimed
                      ? "This studio keeps its own page"
                      : "Tell us what’s wrong or missing"}
                  </span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              {signedIn && (
                <button
                  className="setrow"
                  onClick={() => {
                    setMenuOpen(false);
                    setFeedback("report");
                  }}
                >
                  <span className="setrow-ic"><Icon name="flag" size={22} /></span>
                  <span className="setrow-txt">
                    <span className="t">Report this studio</span>
                    <span className="s">Closed, wrong, or not real</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
                </button>
              )}
              {/* The way out, for the people who run the place. A coach adding
                  a studio put it here; that is not the studio agreeing to be
                  here, and nobody is kept on the app against their wishes. */}
              <button
                className="setrow"
                onClick={() => {
                  setMenuOpen(false);
                  setFeedback("optout");
                }}
              >
                <span className="setrow-ic"><Icon name="public_off" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Take this page down</span>
                  <span className="s">Run this studio and don&rsquo;t want it listed?</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The word about care, before the pencil. The directory is shared, so
          the ask is plain: leave the page more true than you found it. */}
      {mindfulOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMindfulOpen(false);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Before you edit</h2>
            <p className="lead">
              This page is shared: every coach and member who relies on it sees what you
              save. Edits go live at once and are logged with your name. Make the page
              more true than you found it, and leave the rest alone.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  setMindfulOpen(false);
                  setEditOpen(true);
                }}
              >
                Continue to edit
              </button>
            </div>
            <button className="tertiary tellsheet-done" onClick={() => setMindfulOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <StudioOwnerBar open={editOpen} onClose={() => setEditOpen(false)} {...studio} />
      )}
      <StudioFeedback
        studioId={studio.id}
        mode={feedback}
        onClose={() => setFeedback(null)}
        onDone={toast}
      />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
