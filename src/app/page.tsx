import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { googleConfigured } from "@/lib/gcal";
import { appleConfigured } from "@/lib/apple";
import { inviteOnly } from "@/lib/invites";
import { fansEnabled } from "@/lib/flags";
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
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    // A handle is what "set up" means now, for both sides. Bouncing a fan to
    // /feed on sight is what used to stop them ever reaching the claim step.
    if (user?.handle) redirect(user.kind === "fan" ? "/feed" : "/app");
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
          invited={wasInvited}
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
      invited={wasInvited}
      fans={fansEnabled()}
    />
  );
}
