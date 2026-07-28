import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { unreadNotifications } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";

export const dynamic = "force-dynamic";

// The shell the tabbed screens share: header, content, tab bar.
//
// It used to live in each page, which meant three copies of the same user
// query and, worse, chrome that unmounted on every navigation. A layout
// renders once and persists across the loading boundary underneath it, so
// tapping a tab swaps only the content area. The bar you tapped stays put.
export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  // A member has a handle too, so the coach shell keys off `kind`.
  const isCoach = me.kind !== "fan" && !!me.handle;
  const unread = await unreadNotifications(userId);

  return (
    <section className="screen hasnav" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppHeader
          unread={unread}
          nav={{ coach: isCoach }}
          avatar={{
            photo: me.photo,
            color: avatarColor(me),
            initial: ((me.name.trim() || me.email).charAt(0) || "?").toUpperCase(),
            href: isCoach ? "/app?acct=1" : "/you",
          }}
        />
        {children}
      </div>
      <NavBar coach={isCoach} />
    </section>
  );
}
