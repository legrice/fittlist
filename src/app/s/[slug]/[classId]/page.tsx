import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { classDetail } from "@/app/actions/classdetail";
import { getSessionUserId } from "@/lib/session";
import { viewerLook } from "@/lib/look";
import { ClassPage } from "@/components/ClassPage";
import { findStudio } from "@/components/StudioView";
import { classJsonLd, jsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/format";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ slug: string; classId: string }>;
  searchParams: Promise<{ d?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, classId } = await params;
  const { d } = await searchParams;
  const studio = await findStudio(slug);
  if (!studio || !UUID_RE.test(classId)) return { title: "fittlist" };
  const detail = await classDetail(studio.slug ?? studio.id, classId, d);
  if (!detail) return { title: "fittlist" };
  const title = `${detail.name} at ${studio.name} · fittlist`;
  const description = [detail.dateLong, detail.time, studio.name].filter(Boolean).join(" · ");
  const url = `${siteOrigin()}/s/${studio.slug ?? studio.id}/${classId}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "fittlist", images: detail.image ? [{ url: detail.image }] : undefined },
  };
}

// A gym's class, as a page. The mirror of /{handle}/{classId}: a gym's account
// has no handle, so its classes are addressed under the studio that runs them.
// Same loader, same overlay, so the two doors can't drift apart.
export default async function StudioClassPage({ params, searchParams }: Props) {
  const { slug, classId } = await params;
  const { d } = await searchParams;
  if (!UUID_RE.test(classId)) notFound();

  const studio = await findStudio(slug);
  if (!studio?.slug) notFound();
  const detail = await classDetail(studio.slug, classId, d);
  if (!detail) notFound();

  const viewerId = await getSessionUserId();
  return (
    <div className="pub evpage" data-mode={await viewerLook()}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(classJsonLd(detail, siteOrigin())) }} />
      <ClassPage
        detail={detail}
        backHref={`/s/${studio.slug}`}
        backLabel={`Back to ${studio.name}`}
        claimVia={viewerId ? null : null}
      />
    </div>
  );
}
