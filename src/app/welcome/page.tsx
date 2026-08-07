import { and, isNotNull, ne } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { landingHref } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { OnboardingWizard, type SuggestedCoach } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

// The post-signup setup wizard, one shape for everyone now: do you teach,
// about you, follow a few coaches. Reached right after claiming a handle.
// Once finished, users.onboardedAt is set and this page bounces to where
// that side lives.
export default async function WelcomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.handle) redirect("/");
  if (user.onboardedAt) redirect(await landingHref());

  // A handful of coaches worth following on the way in: real pages, photos
  // first, never the person themselves, never a gym account (no handle).
  const coachRows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        ne(schema.users.kind, "fan"),
        ne(schema.users.kind, "gym"),
        ne(schema.users.id, userId),
        isNotNull(schema.users.handle),
      ),
    );
  const suggested: SuggestedCoach[] = coachRows
    .filter((c) => !!c.handle && c.discoverable !== false)
    .sort((a, b) => Number(!!b.photo) - Number(!!a.photo) || a.name.localeCompare(b.name))
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      handle: c.handle!,
      name: c.name.trim() || c.email.split("@")[0],
      photo: c.photo,
      color: avatarColor(c),
      sub: c.title?.trim() || c.disciplines.slice(0, 2).join(", "),
    }));

  return (
    <OnboardingWizard
      landing={await landingHref()}
      name={user.name}
      photo={user.photo}
      title={user.title ?? ""}
      about={user.about ?? ""}
      location={user.location ?? ""}
      suggested={suggested}
    />
  );
}
