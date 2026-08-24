"use client";

import { useState, useTransition } from "react";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { BodyPortal } from "@/components/BodyPortal";
import { FollowHint, followHintOff } from "@/components/FollowHint";
import { useFollowSync } from "@/components/FollowSync";
import { SignupPrompt } from "@/components/SignupPrompt";
import { Toast, useToast } from "@/components/Toast";

/** The public profile's relationship action. Visitors see the same Follow
 * language as members; tapping it explains that following belongs to a free
 * FittList account instead of dropping them into the retired email-list flow. */
export function NotifyCta({
  trainerName,
  handle,
  account = null,
  compact = false,
}: {
  trainerName: string;
  handle: string;
  account?: { following: boolean; requested?: boolean } | null;
  /** Kept for callers during the removal of the old email-subscribe flow. */
  canSignUp?: boolean;
  compact?: boolean;
}) {
  const sync = useFollowSync();
  const [localFollowing, setLocalFollowing] = useState(account?.following ?? false);
  const [localRequested, setLocalRequested] = useState(account?.requested ?? false);
  const following = sync ? sync[0].following : localFollowing;
  const requested = sync ? sync[0].requested : localRequested;
  const setFollowing = (value: boolean) => sync ? sync[1]({ following: value }) : setLocalFollowing(value);
  const setRequested = (value: boolean) => sync ? sync[1]({ requested: value }) : setLocalRequested(value);
  const [signupOpen, setSignupOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const firstName = trainerName.trim().split(/\s+/)[0] || trainerName;

  const label = !account
    ? "Follow"
    : following
      ? "Following"
      : requested
        ? "Requested"
        : "Follow";

  const onCta = () => {
    if (!account) {
      setSignupOpen(true);
      return;
    }
    startTransition(async () => {
      if (following || requested) {
        const result = await unfollowTrainer(handle);
        if (!result.ok) {
          toast(result.error ?? "Something went wrong");
          return;
        }
        const wasRequest = requested && !following;
        setFollowing(false);
        setRequested(false);
        window.dispatchEvent(new Event("calendar-pins-changed"));
        toast(wasRequest ? "Follow request withdrawn" : `Unfollowed ${firstName}`);
        return;
      }

      const result = await followTrainer(handle);
      if (!result.ok) {
        toast(result.error ?? "Something went wrong");
        return;
      }
      if (result.requested) {
        setRequested(true);
        toast(`Follow request sent to ${firstName}`);
      } else {
        setFollowing(true);
        if (!followHintOff()) setHint(true);
      }
    });
  };

  return (
    <>
      <button
        className={`followpill${compact ? " mini" : ""}${following ? " on" : ""}`}
        disabled={pending}
        aria-pressed={account ? following : false}
        onClick={onCta}
      >
        {label}
      </button>

      <BodyPortal>
        <FollowHint name={firstName} handle={handle} on={hint} onClose={() => setHint(false)} />
        <Toast msg={toastMsg} on={toastOn} />
      </BodyPortal>
      <SignupPrompt
        open={signupOpen}
        onClose={() => setSignupOpen(false)}
        next={`/${handle}`}
        via={handle}
        title="Join FittList"
        body="Sign up to follow coaches or make your own FittList."
      />
    </>
  );
}
