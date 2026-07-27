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
}: {
  handle: string;
  open: boolean;
  onClose: () => void;
  onToast: (m: string) => void;
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
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2>Your QR code</h2>
        <p className="lead">
          Point a phone camera at it to open your page. Print it on a flyer or business card, or
          show it at the end of class.
        </p>
        <div className="qrframe">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qrimg" src={qrImgUrl} alt="QR code that opens your fittlist page" />
        </div>
        <div className="qrurl">{pageUrl}</div>
        <div className="publishwrap">
          {canShareFiles ? (
            <button className="btn" disabled={sharing} onClick={shareQr}>
              {sharing ? "Opening…" : "Save QR code"}
            </button>
          ) : (
            <a className="btn" href={qrImgUrl} download={qrFileName}>Save QR code</a>
          )}
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={copyPageLink}>
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
