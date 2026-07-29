"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { blockPerson } from "@/app/actions/blocks";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { Toast, useToast } from "@/components/Toast";

export type FollowerRow = {
  /** The subscriber row id — email-only followers have no user to key on. */
  id: string;
  name: string;
  sub: string;
  photo: string | null;
  color: string;
  /** Set for anyone with a profile to open, member or coach; null otherwise. */
  handle: string | null;
  /** Only a coach can be followed back today: following a member would promise
   *  a week that doesn't exist yet. The row still links to their profile. */
  canFollow: boolean;
  following: boolean;
  /** Present for account followers: blocking needs someone to block. */
  userId: string | null;
};

// Who follows this coach. Everyone shows up: accounts and plain email
// subscribers alike, since both get the digest. Anyone with a profile links to
// it; only a coach gets a Follow back button, because following a member would
// promise a week that isn't there yet.
export function FollowersList({ followers }: { followers: FollowerRow[] }) {
  const router = useRouter();
  const [follows, setFollows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(followers.map((f) => [f.id, f.following])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  // Blocking asks, because it is quiet and one-sided and easy to fat-finger.
  const [confirm, setConfirm] = useState<FollowerRow | null>(null);

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

  const block = (f: FollowerRow) => {
    setConfirm(null);
    if (!f.userId) return;
    setGone((g) => ({ ...g, [f.id]: true }));
    startTransition(async () => {
      const res = await blockPerson(f.userId!);
      if (!res.ok) {
        setGone((g) => ({ ...g, [f.id]: false }));
        toast(res.error ?? "Couldn't do that");
        return;
      }
      // No "they've been told" here, because they haven't been.
      toast("Removed. They can't see your page any more");
      router.refresh();
    });
  };

  const shown = followers.filter((f) => !gone[f.id]);

  if (followers.length === 0) {
    return (
      <div className="empty-block">
        <h2>No followers yet</h2>
        <p>
          Share your link and your QR code. Anyone who follows you, in the app or by email, shows
          up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="dislist">
        {shown.map((f) => {
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
                  <LinkPending />
                </Link>
              ) : (
                <div className="disrow-main">{inner}</div>
              )}
              {f.canFollow && (
                <button
                  type="button"
                  className={`disfollow${follows[f.id] ? " on" : ""}`}
                  disabled={busy === f.id}
                  onClick={() => toggle(f)}
                >
                  {follows[f.id] ? "Following" : "Follow back"}
                </button>
              )}
              {/* Quiet on purpose. Nothing is sent, and nothing on their side
                  says why: the page just stops being there. */}
              {f.userId && (
                <button
                  type="button"
                  className="disblock"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setConfirm(f)}
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {confirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Remove {confirm.name.trim().split(/\s+/)[0]}?</h2>
            <p className="lead">
              They stop following you and your page stops loading for them. They aren&rsquo;t
              told, and nothing on their side says why. You can undo it in settings.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => block(confirm)}>
                Remove them
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
