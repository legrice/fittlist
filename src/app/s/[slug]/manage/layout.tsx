import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { currentUser } from "@/lib/current-user";
import { lookMode } from "@/lib/darkmode";
import { ClientCacheScope } from "@/components/ClientCacheScope";
import { managedStudio } from "@/lib/managed-studio";
import { StudioAdminNav } from "@/components/StudioAdminNav";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#ffffff" };

/**
 * Studio management is part of the signed-in product, even though its routes
 * live beside the public studio page. Keep one persistent app frame around the
 * dashboard and every tool below it instead of rebuilding chrome per screen.
 */
export default async function StudioManageLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const { slug } = await params;
  const { studio } = await managedStudio(slug);

  return (
    <ClientCacheScope viewerId={me.id}>
      <section className="screen hasnav" data-mode={lookMode(me.look)}>
        <div className="pad studio-manage-shell">
          <AppChrome userId={me.id} bar active="calendar" social />
          <div className="studio-admin-workspace">
            <StudioAdminNav name={studio.name} slug={studio.slug ?? studio.id} registrationPro={studio.registrationPro} />
            <div className="studio-admin-main">{children}</div>
          </div>
        </div>
      </section>
    </ClientCacheScope>
  );
}
