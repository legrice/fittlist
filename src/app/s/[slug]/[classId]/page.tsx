import { notFound } from "next/navigation";
import { classDetail } from "@/app/actions/classdetail";
import { getSessionUserId } from "@/lib/session";
import { viewerLook } from "@/lib/look";
import { ClassPage } from "@/components/ClassPage";
import { findStudio } from "@/components/StudioView";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A gym's class, as a page. The mirror of /{handle}/{classId}: a gym's account
// has no handle, so its classes are addressed under the studio that runs them.
// Same loader, same overlay, so the two doors can't drift apart.
export default async function StudioClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; classId: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
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
      <ClassPage
        detail={detail}
        backHref={`/s/${studio.slug}`}
        backLabel={`Back to ${studio.name}`}
        claimVia={viewerId ? null : null}
      />
    </div>
  );
}
