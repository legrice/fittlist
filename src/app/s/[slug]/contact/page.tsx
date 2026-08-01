import { notFound, permanentRedirect } from "next/navigation";
import { findStudio } from "@/components/StudioView";

export const dynamic = "force-dynamic";

// Contact stopped being a section here for the same reason it did on a
// person's page: how to reach somebody is a thing you do, and it lives on the
// pill in the header. The URL stays because it is already out in the world.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await findStudio(slug);
  if (!s) notFound();
  permanentRedirect(`/s/${s.slug ?? s.id}`);
}
