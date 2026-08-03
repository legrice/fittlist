import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansVisible, homeVisible } from "@/lib/flags";
import { homeData } from "@/lib/home";
import { getSessionUserId } from "@/lib/session";
import { HomeScreen } from "@/components/HomeScreen";
import { SetPasswordPrompt } from "@/components/SetPasswordPrompt";

export const dynamic = "force-dynamic";

// The landing tab. Following is what the people you follow are teaching;
// Home is the wider room: your own next seven days, the people and places
// near you, and what your follow graph did lately.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ setpw?: string }>;
}) {
  if (!(await fansVisible())) redirect("/");
  // Dark-launched: the tab isn't in anyone else's bar, and the URL is a
  // guessable door, so it gets the same answer the bar gives.
  if (!(await homeVisible())) redirect("/feed");
  const { setpw } = await searchParams;
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  const data = await homeData(me);
  const isCoach = me.kind !== "fan" && !!me.handle;
  return (
    <>
      <HomeScreen data={data} scheduleHref={isCoach ? "/app" : "/week"} />
      {/* A magic-link landing carries ?setpw=1 so the next visit doesn't
          need another email. This lived on /feed when /feed was the landing
          tab; the landing moved here and the prompt has to follow it. */}
      {setpw === "1" && !me.passwordHash && <SetPasswordPrompt email={me.email} />}
    </>
  );
}
