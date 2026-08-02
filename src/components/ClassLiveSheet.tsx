"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ShareCardSheet } from "@/components/ShareCardSheet";

// The moment after publishing: the class is live, and the two ways to hand it
// on are right here rather than a hunt through menus later. They are both
// "share" and they are different things, so the rows say the difference out
// loud: the link goes to a person, the picture goes on a story or a post.
export function ClassLiveSheet({
  handle,
  classId,
  name,
  onClose,
  onToast,
}: {
  handle: string;
  classId: string;
  name: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [cardOpen, setCardOpen] = useState(false);

  const shareLink = async () => {
    const url = `${window.location.origin}/${handle}/${classId}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onToast("Link copied, ready to paste");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast(url);
    }
  };

  if (cardOpen) {
    return (
      <ShareCardSheet
        path={`/api/card/class/${classId}`}
        fileName={`fittlist-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
        title="Share this class"
        lead="A square image of the class, made for a post or a story. The link on it opens the class."
        alt={`${name} as a card`}
        onClose={() => {
          setCardOpen(false);
          onClose();
        }}
        onToast={onToast}
      />
    );
  }

  return (
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
        <h2>Your class is live</h2>
        <p className="lead">
          {name} is on your page, and your link carries it. Handing it on is how the room
          fills.
        </p>
        <div className="settingslist ownermenu">
          <button className="setrow" onClick={shareLink}>
            <span className="setrow-ic"><Icon name="ios_share" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Share the link</span>
              <span className="s">Send the class to someone, anywhere you message</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
          <button className="setrow" onClick={() => setCardOpen(true)}>
            <span className="setrow-ic"><Icon name="auto_awesome" size={22} /></span>
            <span className="setrow-txt">
              <span className="t">Share a picture</span>
              <span className="s">The class card, made for a story or a post</span>
            </span>
            <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
