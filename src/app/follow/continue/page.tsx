import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmailFollow } from "@/app/actions/subscribe";
import { PublicInfoShell } from "@/components/PublicInfoShell";
import { pendingEmailFollowToken } from "@/lib/email-follow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your follow · FittList",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function EmailFollowContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; retry?: string }>;
}) {
  const [{ confirmed, retry }, token] = await Promise.all([searchParams, pendingEmailFollowToken()]);
  if (confirmed === "1") {
    return (
      <PublicInfoShell>
        <p className="about-kicker">Email confirmed</p>
        <h1>You&rsquo;re all set.</h1>
        <p>Your follow request is complete. Schedule updates will arrive when they&rsquo;re available for this address.</p>
        <Link className="btn si info-page-action" href="/">Back to FittList</Link>
      </PublicInfoShell>
    );
  }

  return (
    <PublicInfoShell>
      <p className="about-kicker">Confirm your email</p>
      <h1>{token ? "Confirm this follow" : "This link is no longer ready"}</h1>
      {token ? (
        <>
          <p>
            FittList hasn&rsquo;t added this address to a coach&rsquo;s list yet. Continue only if you requested this email.
          </p>
          {retry === "1" && (
            <p className="info-page-note">We couldn&rsquo;t finish that just now. Your link is still ready, so please try again.</p>
          )}
          <form action={confirmEmailFollow}>
            <button className="btn si info-page-action" type="submit">Confirm follow</button>
          </form>
          <p className="info-page-note">
            Email providers sometimes preview links for safety. This confirmation keeps those previews from following anyone for you.
          </p>
        </>
      ) : (
        <>
          <p>The link may have expired or already been used. Request a fresh one from the coach&rsquo;s page.</p>
          <Link className="btn si info-page-action" href="/">Back to FittList</Link>
        </>
      )}
    </PublicInfoShell>
  );
}
