"use client";

import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Handing this page to somebody, from the corner of the picture, on every
// profile there is. It faces the back control across the top and wears the
// same shape, because they are the two things that are always true of a page:
// where you came from, and passing it on.
//
// Owners already have a Share pill under the name with the story image and the
// QR code behind it. This is the one a visitor needs, and there was none: the
// only way to send somebody a coach was to copy the address bar.
export function ProfileShare({ path, name }: { path: string; name: string }) {
  const [toastMsg, toastOn, toast] = useToast();

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${name} on fittlist`, url });
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
      <button className="evback profshare-btn" aria-label={`Share ${name}`} onClick={share}>
        <Icon name="ios_share" size={19} />
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
