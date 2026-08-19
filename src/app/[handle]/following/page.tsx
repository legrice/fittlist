import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteOrigin } from "@/lib/format";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { MemberProfileView } from "@/components/MemberProfileView";
import { PublicProfileView } from "@/components/PublicProfileView";
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
  const title = `Who ${user.name} follows · fittlist`;
  const description = `The coaches ${user.name} follows.`;
  const url = `${siteOrigin()}/${handle}/following`;
  // Every URL a coach's page answers to carries the same card. It's the same
  // person whichever section you were sent to.
  const image = `${siteOrigin()}/api/og/${handle}`;
  return {
    title,
    description,
    openGraph: { title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

// The Following tab, as its own page: the coaches this person follows. A
// member's page leads with the same list on its bare handle, so this route
// hands them that tab rather than a missing page.
export default async function FollowingPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const user = await profileUser(handle);
  if (!user) notFound();

  const viewerId = await getSessionUserId();
  // Blocked: the page simply isn't there. Same shape as a deleted account, so
  // it says nothing about why.
  if (await isBlocked(user.id, viewerId)) notFound();
  if (user.kind === "fan") {
    return (
      <MemberProfileView
        user={user}
        isOwner={viewerId === user.id}
        viewerId={viewerId}
        tab="schedule"
        from={from}
      />
    );
  }
  return (
    <PublicProfileView user={user} isOwner={viewerId === user.id} viewerId={viewerId} tab="following" from={from} />
  );
}
