"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Kept under the old export name so every existing doorway can move from the
// retired invite system to one consistent, public FittList share action.
export function InviteSheet({
  onClose,
  onCopied,
}: {
  onClose: () => void;
  onCopied?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const fittlistUrl = mounted ? window.location.origin : "https://fittlist.co";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fittlistUrl);
    } catch {
      // The visible address remains available if a browser blocks clipboard access.
    }
    onCopied?.();
    onClose();
  };

  const share = async () => {
    try {
      await navigator.share({
        title: "FittList",
        text: "Find and share fitness schedules on FittList.",
        url: fittlistUrl,
      });
      onClose();
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") await copy();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="sheet-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        <h2>Share FittList</h2>
        <p className="lead">
          Send FittList to the people you train with so they can find schedules and share theirs.
        </p>

        <div className="joinlink">
          <span className="joinlink-url">{fittlistUrl}</span>
        </div>

        <div className="publishwrap nostick">
          <button className="btn si" onClick={canShare ? share : copy}>
            <Icon name="reply" className="share-arrow-forward" size={20} />
            {canShare ? "Share FittList" : "Copy FittList link"}
          </button>
          {canShare && (
            <button className="btn ghost" style={{ marginTop: 8 }} onClick={copy}>
              Copy FittList link
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function InviteFriends() {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="reply" size={24} />
        </span>
        <span className="setrow-txt">
          <span className="t">Share FittList</span>
          <span className="s">Send the app to the people you train with</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={22} />
        </span>
      </button>
      {open && (
        <InviteSheet
          onClose={() => setOpen(false)}
          onCopied={() => toast("FittList link copied")}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
