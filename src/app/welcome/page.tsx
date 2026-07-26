import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

// The post-signup setup wizard: photo, profile info, and the studios you coach
// at. Reached right after claiming a handle; skippable. Once finished (or
// skipped) users.onboardedAt is set and this page bounces to /app.
export default async function WelcomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.handle) redirect("/");
  if (user.onboardedAt) redirect("/app");

  const [studioRows, mine] = await Promise.all([
    db.select().from(schema.studios).orderBy(schema.studios.seq),
    db
      .select({ studioId: schema.coachStudios.studioId })
      .from(schema.coachStudios)
      .where(eq(schema.coachStudios.userId, userId)),
  ]);

  return (
    <OnboardingWizard
      name={user.name}
      photo={user.photo}
      title={user.title ?? ""}
      about={user.about ?? ""}
      instagram={user.instagram ?? ""}
      website={user.website ?? ""}
      contactEmail={user.contactEmail ?? ""}
      phone={user.phone ?? ""}
      whatsapp={user.whatsapp ?? ""}
      studios={studioRows.map((s) => ({ id: s.id, seq: s.seq, name: s.name, address: s.address }))}
      selectedStudioIds={mine.map((m) => m.studioId)}
    />
  );
}
