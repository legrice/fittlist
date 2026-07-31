import type { Metadata } from "next";
import { siteOrigin } from "@/lib/format";
import { findStudio, StudioView } from "@/components/StudioView";

export const dynamic = "force-dynamic";


type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await findStudio(slug);
  if (!s) return { title: "fittlist" };
  const title = `${s.name} · fittlist`;
  const description = s.about?.trim() || `${s.name}, ${s.address}`;
  return {
    title,
    description,
    alternates: { canonical: `${siteOrigin()}/s/${s.slug ?? s.id}` },
    openGraph: {
      title,
      description,
      url: `${siteOrigin()}/s/${s.slug ?? s.id}`,
      siteName: "fittlist",
      images: s.photo ? [{ url: s.photo }] : undefined,
    },
  };
}


export default async function StudioPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { from } = await searchParams;
  return <StudioView slug={slug} tab="auto" from={from} />;
}
