import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { siteOrigin } from "@/lib/format";
import { isBlocked } from "@/lib/blocks";
import { getSessionUserId } from "@/lib/session";
import { looksLikeBot, recordVisit } from "@/lib/visits";
import { PublicProfileView } from "@/components/PublicProfileView";
import { MemberProfileView } from "@/components/MemberProfileView";
import { jsonLd, profileJsonLd } from "@/lib/seo";
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
  const title = `${user.name} · fittlist`;
  const description =
    user.about?.trim() ||
    (user.kind === "fan"
      ? `${user.name} on fittlist.`
      : `${user.name}'s coaching schedule, every studio in one link.`);
  const url = `${siteOrigin()}/${handle}`;
  // The card is a real URL that composes the photo in. users.photo is a data
  // URL, and an unfurler fetches og:image over HTTP rather than decoding it, so
  // pointing the tag at the column shared a profile with no image at all.
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

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { from } = await searchParams;
  const user = await profileUser(handle);
  if (!user) notFound();

  // The profile is the shared landing - count the visit (not the owner, not bots).
  const [viewerId, hdrs] = await Promise.all([getSessionUserId(), headers()]);
  // Blocked: the page simply isn't there. Same shape as a deleted account, so
  // it says nothing about why, and there's nothing to argue with.
  if (await isBlocked(user.id, viewerId)) notFound();
  if (viewerId !== user.id && !looksLikeBot(hdrs.get("user-agent"))) {
    // Analytics must not sit between a tap and the profile it opened.
    after(async () => {
      try {
        await recordVisit(user.id);
      } catch (err) {
        console.error("visit rollup failed", err);
      }
    });
  }
  const isOwner = viewerId === user.id;
  const structuredData = profileJsonLd(user, siteOrigin());

  // A member has the same kind of link and no schedule behind it, so their
  // profile is its own, much smaller page.
  if (user.kind === "fan") {
    return <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
      <MemberProfileView user={user} isOwner={isOwner} viewerId={viewerId} tab="schedule" from={from} />
    </>;
  }
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <PublicProfileView user={user} isOwner={isOwner} viewerId={viewerId} tab="schedule" from={from} />
  </>;
}
