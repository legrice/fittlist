"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// The coach's QR code in a bottom sheet: point a camera at it to open the
// public page; save/share the PNG or copy the link. Opened from the account
// page and the schedule dashboard strip.
export function QrSheet({
  handle,
  open,
  onClose,
  onToast,
  ownerName,
}: {
  handle: string;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
  /** Set when the sheet shows somebody else's code: their first name puts
   *  "Sara's QR code" on it instead of claiming it's yours. */
  ownerName?: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [pageUrl, setPageUrl] = useState(`fittlist.co/${handle}`);

  useEffect(() => {
    setPageUrl(`${window.location.host}/${handle}`);
  }, [handle]);
  if (!open) return null;

  const qrImgUrl = `/api/qr/${handle}?palette=slate`;

  const shareProfile = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const url = `${window.location.origin}/${handle}`;
      if (typeof navigator.share === "function") {
        await navigator.share({ title: ownerName ? `${ownerName} on FittList` : "My FittList profile", url });
      } else {
        await copyPageLink();
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the profile link");
    } finally {
      setSharing(false);
    }
  };

  const copyPageLink = async () => {
    const url = `${window.location.origin}/${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      onToast("Link copied");
    } catch {
      onToast(url);
    }
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full profile-qr-sheet">
        <div className="adderhead">
          <h2>{ownerName ? `${ownerName.trim().split(/\s+/)[0]}'s QR code` : "Your QR code"}</h2>
          <button className="iconbtn sheetclose adderclose sheet-dismiss" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="lead">
          {ownerName
            ? "Anyone can scan this code to open their profile."
            : "Anyone can scan this code to view your profile, schedule, and contact info."}
        </p>
        <div className="qrframe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qrimg" src={qrImgUrl} alt="QR code that opens this fittlist page" />
        </div>
        <div className="qrurl">{pageUrl}</div>
        <div className="publishwrap">
          <button className="btn" disabled={sharing} onClick={shareProfile}>
            {sharing ? "Opening…" : "Share link to profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
