import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { landingHref } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { OnboardingWizard } from "@/components/OnboardingWizard";

export const dynamic = "force-dynamic";

// The post-signup setup wizard, one shape for everyone now: do you teach,
// about you, follow a few coaches. Reached right after claiming a handle.
// The follow step loads its own suggestions when it opens, so the place
// picked on the page before it can rank them by nearness.
export default async function WelcomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.handle) redirect("/");
  if (user.onboardedAt) redirect(await landingHref());

  return (
    <OnboardingWizard
      landing={await landingHref()}
      name={user.name}
      photo={user.photo}
      title={user.title ?? ""}
      about={user.about ?? ""}
      location={user.location ?? ""}
    />
  );
}
