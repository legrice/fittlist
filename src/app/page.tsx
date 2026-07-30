import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { googleConfigured } from "@/lib/gcal";
import { appleConfigured } from "@/lib/apple";
import { inviteOnly } from "@/lib/invites";
import { fansEnabled } from "@/lib/flags";
import { avatarColor } from "@/lib/avatar";
import { adminEmails } from "@/lib/admin";
import { pendingInviter } from "@/lib/joinlink";
import { AuthFlow } from "@/components/AuthFlow";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ via?: string; invited?: string }>;
}) {
  const { via, invited } = await searchParams;
  const viaHandle = via?.trim() || null;
  // Arrived from a beta invite email rather than stumbling on the site.
  const wasInvited = invited === "1";
  const providers = { google: googleConfigured(), apple: appleConfigured() };
  // Or on somebody's share link, which /j/{code} left in a cookie on the way
  // through. Same gate, and this is who opened it for them. A link from the
  // admin lands as a plain "you're invited" with no name on it: a coach
  // vouching for a friend is social proof, the person running the site
  // appearing on the front door is just their name where it needn't be.
  const via_ = await pendingInviter();
  const viaAdmin = !!via_ && adminEmails().includes(via_.email.toLowerCase());
  const inviter =
    via_ && !viaAdmin
      ? { name: via_.name.trim() || "Someone", photo: via_.photo, color: avatarColor(via_) }
      : null;
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    // A handle is what "set up" means now, for both sides. Bouncing a fan to
    // /feed on sight is what used to stop them ever reaching the claim step.
    // Following is home for everyone with the member side on. Coaches used to
    // land on /app, which since the one-shell change is the bare editable
    // schedule: every login and every visit to the root surfaced a page with
    // no identity, in what read as random places.
    if (user?.handle) redirect(fansEnabled() ? "/feed" : "/app");
    // Signed in but never claimed a handle. `kind` is "coach" by default — the
    // column default, not a choice anyone made — so when members can sign up,
    // ask which they are before demanding a URL. Someone who already answered
    // goes straight to the claim step rather than being asked twice.
    if (user)
      return (
        <AuthFlow
          startStage={fansEnabled() && user.kind !== "fan" ? "role" : "claim"}
          claimAs={user.kind === "fan" ? "fan" : "coach"}
          via={viaHandle}
          providers={providers}
          inviteOnly={inviteOnly()}
          invited={wasInvited || viaAdmin}
          invitedByLink={viaAdmin && !wasInvited}
          inviter={inviter}
          fans={fansEnabled()}
        />
      );
  }
  return (
    <AuthFlow
      startStage="email"
      via={viaHandle}
      providers={providers}
      inviteOnly={inviteOnly()}
      invited={wasInvited || viaAdmin}
      invitedByLink={viaAdmin && !wasInvited}
      inviter={inviter}
      fans={fansEnabled()}
    />
  );
}
