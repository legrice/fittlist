import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { AppChrome } from "@/components/AppChrome";
import { getDb, schema } from "@/db";
import { loadNotificationSheet } from "@/app/actions/notifications";
import { lookMode } from "@/lib/darkmode";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const notificationPage = await loadNotificationSheet();

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <AppChrome userId={userId} mobileHeader={false} />
      <UpdatesScreen
        mode="notifications"
        notificationPage={notificationPage}
      />
    </section>
  );
}
