import { redirect } from "next/navigation";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { AppChrome } from "@/components/AppChrome";
import { loadNotificationSheet } from "@/app/actions/notifications";
import { lookMode } from "@/lib/darkmode";
import { currentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const userId = me.id;
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
