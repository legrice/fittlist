"use client";

import { useState, useTransition } from "react";
import { followTrainer, subscribe, unfollowTrainer, unsubscribeEmail } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Rendered once inside the public hero. The hero button shows on desktop
// (.heronotify) and the fixed bottom bar on mobile (.notifybar) - one
// instance, shared state, both fixed elements escape the hero's layout.
export function NotifyCta({
  trainerName,
  handle,
  account = null,
}: {
  trainerName: string;
  handle: string;
  // Signed-in viewer (fan side): one-tap follow instead of the email sheet.
  account?: { following: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [following, setFollowing] = useState(account?.following ?? false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const firstName = trainerName.trim().split(/\s+/)[0] || trainerName;
  const label = account
    ? following
      ? "Following ✓"
      : `Follow ${firstName}`
    : subscribed
      ? "You're on the list ✓"
      : "Subscribe";
  const toggleFollow = () => {
    startTransition(async () => {
      if (following) {
        const res = await unfollowTrainer(handle);
        if (res.ok) {
          setFollowing(false);
          toast(`Unfollowed ${firstName}`);
        } else toast(res.error ?? "Something went wrong");
      } else {
        const res = await followTrainer(handle);
        if (res.ok) {
          setFollowing(true);
          toast(`You're following ${firstName}`);
        } else toast(res.error ?? "Something went wrong");
      }
    });
  };
  const onCta = () => {
    if (account) {
      toggleFollow();
      return;
    }
    setError("");
    setOpen(true);
  };

  const submit = () => {
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await subscribe(handle, email);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSubscribed(true);
      setOpen(false);
      toast(`You're on ${firstName}'s list`);
    });
  };

  const unsubscribe = () => {
    startTransition(async () => {
      const res = await unsubscribeEmail(handle, email);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSubscribed(false);
      setOpen(false);
      toast("You're off the list");
    });
  };

  return (
    <>
      <button className={`btn heronotify ${subscribed ? "cloudghost" : "si"}`} onClick={onCta}>
        {label}
      </button>
      <div className="notifybar">
        <button className={`btn ${subscribed ? "ghost" : "si"}`} onClick={onCta}>
          {label}
        </button>
      </div>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            {subscribed ? (
              <>
                <h2 style={{ marginTop: 10 }}>You&rsquo;re on the list</h2>
                <p className="lead">
                  {firstName}&rsquo;s schedule lands in <b>{email}</b> once a week. Every email has
                  an unsubscribe link, or tap below. You can rejoin any time.
                </p>
                {error && (
                  <p className="empty" style={{ paddingBottom: 0 }}>
                    {error}
                  </p>
                )}
                <div className="publishwrap">
                  <button className="btn ghost" disabled={pending} onClick={unsubscribe}>
                    {pending ? "Removing…" : "Unsubscribe"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: 10 }}>Get {firstName}&rsquo;s schedule every week</h2>
                <p className="lead">
                  One email a week with {firstName}&rsquo;s upcoming classes. Nothing else, ever.
                  Unsubscribe anytime.
                </p>
                <label className="flabel" htmlFor="ntEmail">
                  Your email
                </label>
                <input
                  type="email"
                  id="ntEmail"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  style={{
                    width: "100%",
                    padding: 13,
                    border: "1.5px solid var(--line)",
                    borderRadius: 11,
                    fontFamily: "inherit",
                    fontSize: 16,
                  }}
                />
                {error && (
                  <p className="empty" style={{ paddingBottom: 0 }}>
                    {error}
                  </p>
                )}
                <div className="publishwrap">
                  <button className="btn si" disabled={pending} onClick={submit}>
                    {pending ? "Adding…" : "Add me to the list"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}
