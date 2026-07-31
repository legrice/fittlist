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
  onCard,
}: {
  handle: string;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
  /** Set when the sheet shows somebody else's code: their first name puts
   *  "Sara's QR code" on it instead of claiming it's yours. */
  ownerName?: string;
  /** Owner only: opens the profile card from here, so every way to share
   *  the page lives behind one door. */
  onCard?: () => void;
}) {
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pageUrl, setPageUrl] = useState(`fittlist.co/${handle}`);

  useEffect(() => {
    setPageUrl(`${window.location.host}/${handle}`);
  }, [handle]);
  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  if (!open) return null;

  const qrImgUrl = `/api/qr/${handle}`;
  const qrFileName = `fittlist-${handle}-qr.png`;

  const shareQr = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(qrImgUrl);
        if (res.ok) {
          const file = new File([await res.blob()], qrFileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = qrImgUrl;
      a.download = qrFileName;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the QR code");
    } finally {
      setSharing(false);
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}/${handle}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `fittlist.co/${handle}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onToast("Link copied");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast(url);
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
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>{ownerName ? `${ownerName.trim().split(/\s+/)[0]}'s QR code` : "Share your page"}</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="lead">
          {ownerName
            ? "Anyone can scan this code to open their profile."
            : "Your link, your QR code, and your card, in one place. The code opens your page from any camera."}
        </p>
        <div className="qrframe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qrimg" src={qrImgUrl} alt="QR code that opens this fittlist page" />
        </div>
        <div className="qrurl">{pageUrl}</div>
        <div className="publishwrap">
          {!ownerName && (
            <button className="btn si" onClick={shareLink}>
              Share your link
            </button>
          )}
          {canShareFiles ? (
            <button className="btn" style={ownerName ? undefined : { marginTop: 8 }} disabled={sharing} onClick={shareQr}>
              {sharing ? "Opening…" : "Save QR code"}
            </button>
          ) : (
            <a className="btn" style={ownerName ? undefined : { marginTop: 8 }} href={qrImgUrl} download={qrFileName}>Save QR code</a>
          )}
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={copyPageLink}>
            Copy link
          </button>
          {onCard && (
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={onCard}>
              Your profile card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
