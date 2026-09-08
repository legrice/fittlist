import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
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
  const [pending] = token ? await (await getDb()).select({registration:schema.magicLinks.registration}).from(schema.magicLinks).where(eq(schema.magicLinks.tokenHash,createHash("sha256").update(token).digest("hex"))).limit(1) : [];
  const eventSignup = !!pending?.registration;
  return (
    <PublicInfoShell>
      <p className="about-kicker">Secure email link</p>
      <h1>{token ? "Continue to FittList" : "This link is no longer ready"}</h1>
      {token ? (
        <>
          <p>
            FittList hasn&rsquo;t signed you in or changed your account yet. Continue only if you requested this email.
          </p>
          {eventSignup && <p>Continuing creates or signs into your FittList account and finishes your requested class registration if space remains. If the class is full and a waitlist is enabled, you’ll join the waitlist instead of receiving a confirmed place. Your name and email go to the event’s admins. By continuing, you agree to the <Link href="/terms">Terms of Use</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>}
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
