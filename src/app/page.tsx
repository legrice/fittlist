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
  searchParams: Promise<{ via?: string }>;
}) {
  const { via } = await searchParams;
  const viaHandle = via?.trim() || null;
  const providers = { google: googleConfigured(), apple: appleConfigured() };
  const userId = await getSessionUserId();
  if (userId) {
    const db = await getDb();
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (user?.handle) redirect("/app");
    if (user?.kind === "fan") redirect("/feed");
    // Signed in but never claimed a handle: resume onboarding at the claim step.
    if (user)
      return (
        <AuthFlow
          startStage="claim"
          via={viaHandle}
          providers={providers}
          inviteOnly={inviteOnly()}
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
      fans={fansEnabled()}
    />
  );
}
