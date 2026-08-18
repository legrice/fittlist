import { redirect } from "next/navigation";
import { fansVisible } from "@/lib/flags";
import { DiscoverList, type DiscoverHalf } from "@/components/DiscoverList";
import { addBrowse } from "@/app/actions/discover";
import { currentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string }>;
}) {
  const { half } = await searchParams;
  // Keep old preview/bookmark URLs useful while the visible information
  // architecture moves from Coaches / Classes / Studios to the prototype's
  // People / Places / Groups. Classes now belongs to calendar creation, not
  // Explore, so an old class link returns to People rather than resurrecting
  // the catalog.
  const startHalf: DiscoverHalf | undefined =
    half === "groups"
      ? "groups"
      : half === "places" || half === "studios"
      ? "places"
      : half === "people" || half === "coaches"
        ? "people"
        : half === "classes"
          ? "classes"
          : undefined;

  if (!(await fansVisible())) redirect("/");
  const me = await currentUser();
  if (!me) redirect("/");
  const upcoming = await addBrowse();
  return (
    <DiscoverList
      people={[]}
      studios={[]}
      cities={[]}
      myCity={me.location?.trim() || null}
      myLat={me.locationLat}
      myLng={me.locationLng}
      startHalf={startHalf}
      upcoming={upcoming?.days ?? []}
      groups={[]}
      backHref="/feed"
      hideBack
    />
  );
}
