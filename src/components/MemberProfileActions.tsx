"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QrSheet } from "@/components/QrSheet";
import { Toast, useToast } from "@/components/Toast";

// A member looking at their own profile, in the same two slots a visitor gets
// and a coach's owner bar uses: Share filled, Edit profile outline. Two of the
// coach's four share rows are missing on purpose, because they are about a
// published week and a member has none: what's left is the link and the code.
export function MemberProfileActions({ handle }: { handle: string }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [qr, setQr] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
      setMenu(false);
      toast("Link copied");
    } catch {
      toast("Couldn't copy that");
    }
  };

  return (
    <>
      <div className="profacts">
        <button className="actpill" onClick={() => setMenu(true)}>
          <Icon name="reply" className="share-arrow-forward" size={18} />
          <span>Share profile</span>
        </button>
        <button className="actpill profile-owner-primary" onClick={() => router.push("/settings?edit=1")}>
          <Icon name="edit" size={18} />
          <span>Edit profile</span>
        </button>
      </div>

      {menu && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenu(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMenu(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Share your page</h2>
            <div className="settingslist ownermenu">
              <button className="setrow" onClick={copyLink}>
                <span className="setrow-ic">
                  <Icon name="link" size={24} />
                </span>
                <span className="setrow-txt">
                  <span className="t">Copy your link</span>
                  <span className="s">Straight to your page</span>
                </span>
                <span className="setrow-chev">
                  <Icon name="chevron_right" size={22} />
                </span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setMenu(false);
                  setQr(true);
                }}
              >
                <span className="setrow-ic">
                  <Icon name="qr_code_2" size={24} />
                </span>
                <span className="setrow-txt">
                  <span className="t">Your QR code</span>
                  <span className="s">A scannable code that opens your page</span>
                </span>
                <span className="setrow-chev">
                  <Icon name="chevron_right" size={22} />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QrSheet handle={handle} open={qr} onClose={() => setQr(false)} onToast={toast} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
