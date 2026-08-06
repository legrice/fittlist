import { redirect } from "next/navigation";
import { discoverPeople } from "@/app/actions/discover";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { DiscoverList } from "@/components/DiscoverList";

export const dynamic = "force-dynamic";

// The directory: every coach with a live page. This is the answer to "I just
// signed up and follow nobody", and the only screen where a member meets a
// coach they weren't already handed a link to.
//
// It is also a sheet now: the search button on Following pulls the same list
// up over the week rather than sending anybody anywhere. This page stays
// because the URL is out in the world, in old links and on the empty state's
// own button, and because a directory somebody was sent to should be a page.
// Both read `discoverPeople()`, so neither can list somebody the other hides.
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ half?: string }>;
}) {
  // Discover is one list now: the coaches. Classes went first, then Studios,
  // both for the same reason, which is that a directory nobody can follow
  // anything from is not doing the one job this screen has. `?half=` is read
  // and ignored, so every old link still lands somewhere real.
  await searchParams;
  if (!(await fansVisible())) redirect("/");
  if (!(await getSessionUserId())) redirect("/");

  const { people, cities, myCity } = await discoverPeople();

  return <DiscoverList people={people} cities={cities} myCity={myCity} backHref="/feed" hideBack />;
}
