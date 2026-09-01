"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { FittlistShareSheet } from "@/components/InAppShare";
import { Toast, useToast } from "@/components/Toast";

// Handing this page to somebody, from the corner of the picture, on every
// profile there is. It faces the back control across the top and wears the
// same shape, because they are the two things that are always true of a page:
// where you came from, and passing it on.
//
// Owners already have a Share pill under the name with the story image and the
// QR code behind it. This is the one a visitor needs, and there was none: the
// only way to send somebody a coach was to copy the address bar.
export function ProfileShare({ path, name, pill = false, cta = false, ctaText = "Share profile", pillText = "Share" }: { path: string; name: string; pill?: boolean; cta?: boolean; ctaText?: string; pillText?: string }) {
  const [toastMsg, toastOn, toast] = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className={cta ? "profile-share-cta-btn" : pill ? "actpill profile-share-pill" : "evback profshare-btn"} aria-label={`Share ${name}`} onClick={() => setOpen(true)}>
        <Icon name="reply" className="share-arrow-forward" size={21} />
        {pill ? <span>{pillText}</span> : cta ? <span>{ctaText}</span> : null}
      </button>
      {open && (
        <FittlistShareSheet
          title={`${name} on FittList`}
          url={`${window.location.origin}${path}`}
          onClose={() => setOpen(false)}
          onToast={toast}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
