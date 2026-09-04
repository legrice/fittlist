import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { markUpdatesSeen } from "@/app/actions/notifications";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { lookMode } from "@/lib/darkmode";
import { listNotifications } from "@/lib/notify";
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
  const notifications = (await listNotifications(userId, 50, ["message", "feedback"])).map(
    (notification) => ({
      ...notification,
      actor: notification.actorId
        ? {
            name: notification.actorName ?? "",
            photo: notification.actorPhoto,
            color: avatarColor({
              id: notification.actorId,
              avatarColor: notification.actorColor,
            }),
            handle: notification.actorHandle,
          }
        : null,
    }),
  );

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <UpdatesScreen
        mode="notifications"
        notifications={notifications}
        markSeen={markUpdatesSeen}
      />
    </section>
  );
}
