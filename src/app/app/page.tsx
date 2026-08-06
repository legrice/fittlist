import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The coach's old calendar, now a door onto the new one.
 *
 * This was the whole coach shell: its own header, its own bottom bar, and a
 * schedule holding four kinds of row at once (what you teach, the shifts a gym
 * had you on, the classes you had saved off somebody else's page, your own
 * private entries), each with its own colour bar and its own tap behaviour.
 * The Calendar tab in the tabs group replaced every part of that.
 *
 * It could not simply be deleted, and leaving it live was worse than either:
 * `/app` is the installed app's `start_url`, so every coach who put fittlist on
 * their home screen was launching straight into the old screen, complete with
 * the going ribbons and the coloured bars this build removed everywhere else.
 * Two calendars, and the one most people opened was the wrong one.
 *
 * `?acct=1` was the settings gear's href for months and still lands.
 */
export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; acct?: string }>;
}) {
  const { add, acct } = await searchParams;
  if (acct) redirect("/settings");
  // `?add=1` opened the adder on arrival. It is carried rather than dropped,
  // because it is what "Add a class" links out in the world still say.
  redirect(add ? "/calendar?add=1" : "/calendar");
}
