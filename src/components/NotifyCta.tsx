"use client";

import { useState, useTransition } from "react";
import { passwordAuth } from "@/app/actions/auth";
import { requestInvite } from "@/app/actions/invites";
import { followTrainer, subscribe, unfollowTrainer, unsubscribeEmail } from "@/app/actions/subscribe";
import { BodyPortal } from "@/components/BodyPortal";
import { useFollowSync } from "@/components/FollowSync";
import { Icon } from "@/components/Icon";
import { FollowHint, followHintOff } from "@/components/FollowHint";
import { Toast, useToast } from "@/components/Toast";

// The one action a visitor can take on a coach's page, sitting beside their
// name: Follow for a signed-in member, the email list for everyone else. The
// sheet it opens travels with it.
export function NotifyCta({
  trainerName,
  handle,
  account = null,
  canSignUp = false,
  compact = false,
}: {
  trainerName: string;
  handle: string;
  // Signed-in viewer (fan side): one-tap follow instead of the email sheet.
  // `requested` means a follow request is waiting on the coach's answer.
  account?: { following: boolean; requested?: boolean } | null;
  // Member signups are open, so a fresh subscriber can be offered an account.
  canSignUp?: boolean;
  // The sticky bar's copy: a smaller pill, same behaviour.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Shown right after a successful subscribe: they've already given the email
  // and got what they came for, so the account is an upgrade rather than a
  // toll gate. Asking before would be a question at the moment they said yes.
  const [offerAccount, setOfferAccount] = useState(false);
  // The beta gate turned them away. They're already on the coach's email list,
  // so this is a waitlist, not a wall — file the request and say so.
  const [waitlisted, setWaitlisted] = useState(false);
  const [password, setPassword] = useState("");
  // The follow/subscribe answer lives in FollowSync when the page provides
  // one, so the header pill and the sticky bar's copy agree; the local state
  // is the fallback for a lone instance.
  const sync = useFollowSync();
  const [localSub, setLocalSub] = useState(false);
  const [localFollowing, setLocalFollowing] = useState(account?.following ?? false);
  const [localRequested, setLocalRequested] = useState(account?.requested ?? false);
  const subscribed = sync ? sync[0].subscribed : localSub;
  const following = sync ? sync[0].following : localFollowing;
  const requested = sync ? sync[0].requested : localRequested;
  const setSubscribed = (v: boolean) => (sync ? sync[1]({ subscribed: v }) : setLocalSub(v));
  const setFollowing = (v: boolean) => (sync ? sync[1]({ following: v }) : setLocalFollowing(v));
  const setRequested = (v: boolean) => (sync ? sync[1]({ requested: v }) : setLocalRequested(v));
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const firstName = trainerName.trim().split(/\s+/)[0] || trainerName;
  const label = account
    ? following
      ? "Following"
      : requested
        ? "Requested"
        : "Follow"
    : subscribed
      ? "On the list"
      : "Subscribe";
  const toggleFollow = () => {
    startTransition(async () => {
      if (following || requested) {
        const res = await unfollowTrainer(handle);
        if (res.ok) {
          const wasRequest = requested && !following;
          setFollowing(false);
          setRequested(false);
          toast(wasRequest ? "Request withdrawn" : `Unfollowed ${firstName}`);
        } else toast(res.error ?? "Something went wrong");
      } else {
        const res = await followTrainer(handle);
        if (res.ok) {
          if (res.requested) {
            setRequested(true);
            toast(`Asked to follow ${firstName}`);
          } else {
            setFollowing(true);
            // The hint says where their classes went; the toast only says the
            // tap landed, so they don't both fire.
            if (followHintOff()) toast(`You're following ${firstName}`);
            else setHint(true);
          }
        } else toast(res.error ?? "Something went wrong");
      }
    });
  };
  const [hint, setHint] = useState(false);
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
      if (canSignUp) {
        setPassword("");
        setOfferAccount(true);
      } else {
        setOpen(false);
      }
      toast(`You're on ${firstName}'s list`);
    });
  };

  const createAccount = () => {
    startTransition(async () => {
      setError("");
      const res = await passwordAuth(email, password, true);
      if (!res.ok) {
        if (res.needsInvite) {
          // Don't make them fill in a second form to ask: they've already given
          // the email, and asking is the whole content of the request.
          await requestInvite("", email);
          setWaitlisted(true);
          return;
        }
        setError(res.error ?? "Something went wrong.");
        return;
      }
      // A full reload rather than router.refresh(): they've gone from visitor
      // to member, which changes what the whole page renders — the chrome, the
      // footer, and this button's own starting state. Re-rendering the server
      // components alone would leave the client state behind.
      window.location.reload();
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
      <button
        className={`followpill${compact ? " mini" : ""}${following || subscribed ? " on" : ""}`}
        disabled={pending}
        aria-pressed={account ? following : subscribed}
        onClick={onCta}
      >
        {/* A tick on the yes state, so the pill reports rather than offers. */}
        {(following || subscribed) && <Icon name="check" size={compact ? 15 : 17} />}
        {label}
      </button>

      {/* Fixed layers, portaled out of the pinned head this pill renders in:
          sticky is a stacking context on mobile, and trapped there the sheet
          paints under the card and the tab bar. */}
      <BodyPortal>
      <FollowHint name={firstName} on={hint} onClose={() => setHint(false)} />

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            {waitlisted ? (
              <>
                <h2 style={{ marginTop: 10 }}>You&rsquo;re on the beta list</h2>
                <p className="lead">
                  Accounts are invite-only while we&rsquo;re in beta, so we&rsquo;ve put{" "}
                  <b>{email}</b> in the queue. Nothing is lost in the meantime:
                  {" "}{firstName}&rsquo;s schedule still lands in your inbox every week, and
                  we&rsquo;ll email you the moment there&rsquo;s room.
                </p>
                <div className="publishwrap">
                  <button
                    className="btn si"
                    onClick={() => {
                      setWaitlisted(false);
                      setOfferAccount(false);
                      setOpen(false);
                    }}
                  >
                    Got it
                  </button>
                </div>
              </>
            ) : offerAccount ? (
              <>
                <h2 style={{ marginTop: 10 }}>You&rsquo;re on {firstName}&rsquo;s list</h2>
                <p className="lead">
                  We&rsquo;re still in beta, and we&rsquo;re glad you want to follow {firstName}.
                  Ask for an account while you&rsquo;re here: every coach you follow lands in one
                  week, and you can mark the classes you&rsquo;re going to.
                </p>
                <label className="flabel" htmlFor="ntPw">
                  Pick a password <span>· for {email}</span>
                </label>
                <input
                  type="password"
                  id="ntPw"
                  className="editinput"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createAccount()}
                />
                {error && (
                  <p className="empty" style={{ paddingBottom: 0 }}>
                    {error}
                  </p>
                )}
                <div className="publishwrap">
                  <button
                    className="btn si"
                    disabled={pending || password.length < 8}
                    onClick={createAccount}
                  >
                    {pending ? "One sec…" : "Create my account"}
                  </button>
                  <button
                    className="tertiary"
                    style={{ display: "block", margin: "10px auto 0" }}
                    disabled={pending}
                    onClick={() => {
                      setOfferAccount(false);
                      setOpen(false);
                    }}
                  >
                    Maybe later, just email me
                  </button>
                </div>
              </>
            ) : subscribed ? (
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
      </BodyPortal>
    </>
  );
}
