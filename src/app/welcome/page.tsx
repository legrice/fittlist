import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { landingHref } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

// The post-signup setup wizard. A coach gets photo, profile info, and the
// studios they coach at; a member gets photo and a bio, and stops there.
// Reached right after claiming a handle; skippable. Once finished (or skipped)
// users.onboardedAt is set and this page bounces to where that side lives.
export default async function WelcomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.handle) redirect("/");
  const fan = user.kind === "fan";
  if (user.onboardedAt) redirect(fan ? await landingHref() : "/app");

  // A member never sees the studio step, so don't pay for the query.
  const [studioRows, mine] = fan
    ? [[], []]
    : await Promise.all([
        db.select().from(schema.studios).orderBy(schema.studios.seq),
        db
          .select({ studioId: schema.coachStudios.studioId })
          .from(schema.coachStudios)
          .where(eq(schema.coachStudios.userId, userId)),
      ]);

  return (
    <OnboardingWizard
      kind={fan ? "fan" : "coach"}
      landing={await landingHref()}
      name={user.name}
      photo={user.photo}
      title={user.title ?? ""}
      about={user.about ?? ""}
      location={user.location ?? ""}
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
