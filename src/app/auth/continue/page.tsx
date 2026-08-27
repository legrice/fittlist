import type { Metadata } from "next";
import Link from "next/link";
import { confirmMagicLink } from "@/app/actions/auth";
import { PublicInfoShell } from "@/components/PublicInfoShell";
import { pendingMagicToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Continue securely · FittList",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function MagicContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const [{ invited }, token] = await Promise.all([searchParams, pendingMagicToken()]);
  return (
    <PublicInfoShell>
      <p className="about-kicker">Secure email link</p>
      <h1>{token ? "Continue to FittList" : "This link is no longer ready"}</h1>
      {token ? (
        <>
          <p>
            FittList hasn&rsquo;t signed you in or changed your account yet. Continue only if you requested this email.
          </p>
          <form action={confirmMagicLink}>
            {invited === "1" && <input type="hidden" name="invited" value="1" />}
            <button className="btn si info-page-action" type="submit">
              Continue securely
            </button>
          </form>
          <p className="info-page-note">
            Email providers sometimes preview links for safety. This confirmation keeps those previews from using your one-time link.
          </p>
        </>
      ) : (
        <>
          <p>The link may have expired or already been used. Request a fresh one to continue.</p>
          <Link className="btn si info-page-action" href="/?join=login">Request a new link</Link>
        </>
      )}
    </PublicInfoShell>
  );
}
