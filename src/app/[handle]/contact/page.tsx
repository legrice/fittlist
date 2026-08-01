import { eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string }>;
};

// Contact stopped being a section and became a pill and a sheet: how to reach
// somebody is a thing you do, not a page you read. The URL stays because it's
// already out in the world, and it sends people to the schedule, where the
// pill is. The checks above the redirect still run: a blocked viewer gets the
// same nothing here as everywhere else.
export default async function ContactPage({ params }: Props) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();
  if (user.kind === "fan") notFound();

  const viewerId = await getSessionUserId();
  if (await isBlocked(user.id, viewerId)) notFound();
  permanentRedirect(`/${handle}`);
}
