import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteOrigin } from "@/lib/format";
import { hiddenFrom } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { PublicProfileView } from "@/components/PublicProfileView";
import { MemberProfileView } from "@/components/MemberProfileView";
import { profileUser } from "@/lib/profile-user";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  const user = await profileUser(handle);
  if (!user) return { title: "fittlist" };
  const title = `${user.name}'s places · fittlist`;
  const description = `The fitness places connected to ${user.name}.`;
  const url = `${siteOrigin()}/${handle}/studios`;
  // Every URL a coach's page answers to carries the same card. It's the same
  // person whichever section you were sent to.
  const image = `${siteOrigin()}/api/og/${handle}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "fittlist",
      type: "profile",
      images: [{ url: image, width: 1200, height: 630, alt: user.name }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// The Studios tab, as its own page: where this coach teaches, one row per
// place. The view falls back to the schedule when there's nothing to list.
export default async function StudiosPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const user = await profileUser(handle);
  if (!user) notFound();
  const viewerId = await getSessionUserId();
  // Blocked: the page simply isn't there. Same shape as a deleted account, so
  // it says nothing about why.
  if ((await hiddenFrom(viewerId)).has(user.id)) notFound();
  if (user.kind === "fan") {
    return (
      <MemberProfileView
        user={user}
        isOwner={viewerId === user.id}
        viewerId={viewerId}
        tab="studios"
        from={from}
      />
    );
  }
  return <PublicProfileView user={user} isOwner={viewerId === user.id} viewerId={viewerId} tab="studios" from={from} />;
}
