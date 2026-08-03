import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { landingHref } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  // A member has a handle but no schedule, so this shell isn't theirs.
  if (!user?.handle) redirect("/");
  if (user.kind === "fan") redirect(await landingHref());

  return (
    <div className="appshell" data-theme={user.theme} data-mode={user.look === "dark" ? "dark" : undefined}>
      <div className="stage">{children}</div>
    </div>
  );
}
