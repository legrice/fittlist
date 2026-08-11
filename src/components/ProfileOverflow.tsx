"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

export function ProfileOverflow({ path, name }: { path: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    setOpen(false);
    try {
      if (navigator.share) await navigator.share({ title: `${name} on fittlist`, url });
      else { await navigator.clipboard.writeText(url); toast("Link copied"); }
    } catch { /* dismissed */ }
  };
  return (
    <>
      <button className="evback prof-overflow-trigger" aria-label={`More options for ${name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="more_horiz" size={23} />
      </button>
      {open ? (
        <div className="prof-overflow-pop" role="menu">
          <button role="menuitem" onClick={share}><Icon name="ios_share" size={20} /> Share profile</button>
        </div>
      ) : null}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
