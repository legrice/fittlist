import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { fmtTime, siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { viewerLook } from "@/lib/look";
import { classDetail } from "@/app/actions/classdetail";
import { ClassPage } from "@/components/ClassPage";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ handle: string; classId: string }>;
  searchParams: Promise<{ d?: string; from?: string; g?: string }>;
};

// The link preview is the mini poster: /api/og/class composes the date tile,
// the name, the when-and-where and the coach, and the ?d= the share links
// carry rides through so the poster names the same day the sender meant.
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle, classId } = await params;
  const { d, g } = await searchParams;
  if (!UUID_RE.test(classId)) return { title: "fittlist" };
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return { title: "fittlist" };
  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.userId, user.id)));
  if (!c || !c.isPublic) return { title: "fittlist" };
  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];
  const title = `${c.name} with ${user.name} · fittlist`;
  const place = studio?.name ?? c.location ?? "";
  const description = [fmtTime(c.startTime), `${c.durationMin} min`, place]
    .filter(Boolean)
    .join(" · ");
  const dOk = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  const gOk = g && /^[a-z0-9-]{1,40}$/i.test(g) ? g : null;
  const imgQs = [dOk && `d=${dOk}`, gOk && `g=${gOk}`].filter(Boolean).join("&");
  const image = `${siteOrigin()}/api/og/class/${c.id}${imgQs ? `?${imgQs}` : ""}`;
  const url = `${siteOrigin()}/${handle}/${c.id}${dOk ? `?d=${dOk}` : ""}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "fittlist",
      images: [{ url: image, width: 1200, height: 630, alt: c.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// The page is a thin shell around the class overlay: classDetail() decides
// what this viewer may see (private stays owner-only, blocked sees nothing,
// ?d= pins the occurrence), and ClassSheet renders it exactly as the lists
// do. The shell's own job is the 404, the coach's theme, and where back goes.
export default async function EventPage({ params, searchParams }: Props) {
  const { handle, classId } = await params;
  const { d: dParam, from } = await searchParams;
  if (!UUID_RE.test(classId)) notFound();

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const detail = await classDetail(handle, classId, dParam);
  if (!detail) notFound();

  const viewerId = await getSessionUserId();

  // Back goes where you actually came from — off the Following tab it returns
  // there, not into a coach's calendar you never opened. (`from=home` is the
  // link's own token; the tab it names is Following.)
  const backHref = from === "home" ? "/feed" : `/${handle}/schedule`;
  const backLabel = from === "home" ? "Back to Following" : `Back to ${user.name}’s schedule`;

  return (
    <div className="pub evpage" data-theme={user.theme} data-mode={await viewerLook()}>
      <ClassPage
        detail={detail}
        backHref={backHref}
        backLabel={backLabel}
        claimVia={viewerId ? null : handle}
      />
    </div>
  );
}
