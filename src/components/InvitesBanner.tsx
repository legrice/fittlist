"use client";

import { useState, useTransition } from "react";
import { dismissInvitesBanner } from "@/app/actions/invites";
import { Icon } from "@/components/Icon";
import { InviteSheet } from "@/components/InviteFriends";
import { Toast, useToast } from "@/components/Toast";

// A closed beta only grows if the people in it know they can bring someone.
//
// The settings row has been there the whole time and almost nobody has opened
// it, because nobody goes looking in settings for a thing they don't know
// exists. This says it once, at the top, where they already are.
//
// Once. Closing it is permanent and recorded on the account, so it doesn't
// come back on the laptop; the settings row stays as the door.
export function InvitesBanner() {
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const close = () => {
    setGone(true);
    start(() => {
      dismissInvitesBanner().catch(() => {});
    });
  };

  if (gone) return null;

  return (
    <>
      <div className="invbanner">
        <button className="invbanner-main" onClick={() => setOpen(true)}>
          <span className="invbanner-ic" aria-hidden="true">
            <Icon name="groups" size={18} />
          </span>
          <span className="invbanner-txt">
            <b>Bring people in</b>
            <span>Know a coach who should be in here? Send them your link.</span>
          </span>
        </button>
        <button className="invbanner-x" aria-label="Dismiss" onClick={close}>
          <Icon name="close" size={16} />
        </button>
      </div>
      {open && (
        <InviteSheet
          onClose={() => setOpen(false)}
          onCopied={() => toast("Link copied, ready to paste")}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
