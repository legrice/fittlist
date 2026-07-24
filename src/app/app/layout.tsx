import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { SideNav, TabBar } from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.handle) redirect("/");

  return (
    <div className="appshell">
      <SideNav handle={user.handle} />
      <div className="stage">{children}</div>
      <TabBar />
    </div>
  );
}
