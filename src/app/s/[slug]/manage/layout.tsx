import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { currentUser } from "@/lib/current-user";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#ffffff" };

/**
 * Studio management is part of the signed-in product, even though its routes
 * live beside the public studio page. Keep one persistent app frame around the
 * dashboard and every tool below it instead of rebuilding chrome per screen.
 */
export default async function StudioManageLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (!me) redirect("/");

  return (
    <section className="screen hasnav" data-mode={lookMode(me.look)}>
      <div className="pad studio-manage-shell">
        <AppChrome userId={me.id} bar active="calendar" social />
        {children}
      </div>
    </section>
  );
}
