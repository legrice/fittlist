"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { QrSheet } from "@/components/QrSheet";
import { Toast, useToast } from "@/components/Toast";

// Tap a face, see the face. The avatar blows up over a blurred page with the
// things you'd want to do with a person under it: follow them, share or copy
// their link, and their QR code. Everything here is about the profile being
// looked at, never the viewer's own.
export function AvatarZoom({
  handle,
  name,
  photo,
  color,
  className,
  /** null hides the Follow action: the owner, or nobody signed in. */
  follow = null,
  isOwner = false,
}: {
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  /** The avatar's existing class on this page, so the trigger looks identical
   *  to the plain avatar it replaces. */
  className: string;
  follow?: { following: boolean; requested?: boolean } | null;
  /** The person looking is the person shown; the QR sheet says "Your". */
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [following, setFollowing] = useState(follow?.following ?? false);
  const [requested, setRequested] = useState(follow?.requested ?? false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  useEffect(() => setMounted(true), []);

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const url = () => `${window.location.origin}/${handle}`;

  const toggleFollow = () => {
    if (pending) return;
    start(async () => {
      if (following || requested) {
        const res = await unfollowTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        setFollowing(false);
        setRequested(false);
      } else {
        const res = await followTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        if (res.requested) setRequested(true);
        else setFollowing(true);
      }
      router.refresh();
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      toast("Link copied");
    } catch {
      toast(url().replace(/^https?:\/\//, ""));
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${name} on fittlist`, url: url() });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") copy();
    }
  };

  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={photo} alt={name} />
  ) : (
    <span className={`${className} ${className}-empty`} style={{ background: color }} aria-hidden="true">
      {initial}
    </span>
  );

  return (
    <>
      <button
        type="button"
        className="avzoom-trigger"
        aria-label={`Open ${name}'s photo`}
        onClick={() => setOpen(true)}
      >
        {face}
      </button>
      {open && mounted &&
        createPortal(
          <div
            className="avoverlay"
            role="dialog"
            aria-label={`${name}'s photo`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avoverlay-photo" src={photo} alt={name} />
            ) : (
              <span className="avoverlay-photo avoverlay-photo-empty" style={{ background: color }}>
                {initial}
              </span>
            )}
            <div className="avoverlay-acts">
              {follow && (
                <button className="avact" disabled={pending} onClick={toggleFollow}>
                  <span className={`avact-ic${following ? " on" : ""}`}>
                    <Icon name={following ? "check" : requested ? "schedule" : "person_add"} size={22} />
                  </span>
                  {following ? "Following" : requested ? "Requested" : "Follow"}
                </button>
              )}
              <button className="avact" onClick={share}>
                <span className="avact-ic">
                  <Icon name="ios_share" size={22} />
                </span>
                Share
              </button>
              <button className="avact" onClick={copy}>
                <span className="avact-ic">
                  <Icon name="link" size={22} />
                </span>
                Copy link
              </button>
              <button className="avact" onClick={() => setQrOpen(true)}>
                <span className="avact-ic">
                  <Icon name="qr_code_2" size={22} />
                </span>
                QR code
              </button>
            </div>
            <QrSheet
              handle={handle}
              open={qrOpen}
              onClose={() => setQrOpen(false)}
              onToast={toast}
              ownerName={isOwner ? undefined : name}
            />
          </div>,
          document.body,
        )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
