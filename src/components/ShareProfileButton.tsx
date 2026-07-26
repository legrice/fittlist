"use client";

import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// A share button for the public profile: opens the native share sheet where
// available (phones), otherwise copies the profile link to the clipboard.
export function ShareProfileButton({ name }: { name: string }) {
  const [toastMsg, toastOn, toast] = useToast();

  const share = async () => {
    const url = window.location.href.split("?")[0];
    try {
      if (typeof navigator.share === "function") {
        // Just the link, no title/text, so a paste is the bare URL.
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied");
      } catch {
        toast(url);
      }
    }
  };

  return (
    <>
      <button className="profshare" aria-label={`Share ${name}`} onClick={share}>
        <Icon name="ios_share" size={20} />
      </button>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
