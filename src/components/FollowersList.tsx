"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Toast, useToast } from "@/components/Toast";

export type FollowerRow = {
  /** The subscriber row id — email-only followers have no user to key on. */
  id: string;
  name: string;
  sub: string;
  photo: string | null;
  color: string;
  /** Set only for followers who have a page of their own; null otherwise. */
  handle: string | null;
  following: boolean;
};

// Who follows this coach. Everyone shows up — accounts and plain email
// subscribers alike, since both get the digest — but only the ones with a page
// of their own can be followed back, so that's the only row with a button.
export function FollowersList({ followers }: { followers: FollowerRow[] }) {
  const [follows, setFollows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(followers.map((f) => [f.id, f.following])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const toggle = (f: FollowerRow) => {
    if (!f.handle) return;
    const next = !follows[f.id];
    setFollows((m) => ({ ...m, [f.id]: next })); // optimistic: the tap must feel instant
    setBusy(f.id);
    startTransition(async () => {
      const res = next ? await followTrainer(f.handle!) : await unfollowTrainer(f.handle!);
      setBusy(null);
      if (!res.ok) {
        setFollows((m) => ({ ...m, [f.id]: !next }));
        toast(res.error ?? "Something went wrong.");
        return;
      }
      toast(next ? `Following ${f.name.trim().split(/\s+/)[0]}` : "Unfollowed");
    });
  };

  if (followers.length === 0) {
    return (
      <div className="empty-block">
        <h2>No followers yet</h2>
        <p>
          Share your link and your QR code. Anyone who follows you — in the app or by email — shows
          up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="dislist">
        {followers.map((f) => {
          const initial = (f.name.trim().charAt(0) || "?").toUpperCase();
          const avatar = f.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="disrow-av" src={f.photo} alt="" />
          ) : (
            <span
              className="disrow-av disrow-av-empty"
              style={{ background: f.color }}
              aria-hidden="true"
            >
              {initial}
            </span>
          );
          const inner = (
            <>
              {avatar}
              <span className="disrow-txt">
                <span className="nm">{f.name}</span>
                <span className="sub">{f.sub}</span>
              </span>
            </>
          );
          return (
            <div key={f.id} className="disrow">
              {f.handle ? (
                <Link className="disrow-main" href={`/${f.handle}?from=followers`}>
                  {inner}
                </Link>
              ) : (
                <div className="disrow-main">{inner}</div>
              )}
              {f.handle && (
                <button
                  type="button"
                  className={`disfollow${follows[f.id] ? " on" : ""}`}
                  disabled={busy === f.id}
                  onClick={() => toggle(f)}
                >
                  {follows[f.id] ? "Following" : "Follow back"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
