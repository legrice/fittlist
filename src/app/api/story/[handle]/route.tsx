import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { DAYS, fmtTime, runsOn, storyLook, timeToMinutes, todayIso as todayIsoNow } from "@/lib/format";
import { headlineOf, renderStory } from "@/lib/storyimage";
import { listBudget, planStory } from "@/lib/storyplan";

// The coach's public poster: their week, drawn 1080x1920 for Stories. The paint
// lives in `storyimage.tsx`, shared with the member's and the composer's, so a
// fix to one is a fix to all three.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const params2 = new URL(req.url).searchParams;
  const span = params2.get("span") === "day" ? "day" : "week";
  // Style first, then one of the three colourways that style is offered in.
  // Colour belongs to the style rather than sitting beside it, so a diner
  // sign is never asked to wear Midnight.
  const [, y, t] = storyLook(params2.get("style"), params2.get("palette") ?? params2.get("theme"));

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  const classRows = (await publicSchedule(user)).filter((c) => c.isPublic); // shareable: public only
  // The week image starts on *today* and runs the next 7 days (1 for "day").
  const todayIso = todayIsoNow();
  const start = new Date(`${todayIso}T00:00:00Z`);
  const spanDays = span === "day" ? 1 : 7;
  const byDay: { day: string; items: typeof classRows }[] = [];
  const usedStudioIds = new Set<string>();
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    const items = classRows
      .filter((c) => runsOn(c, iso, dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length) {
      items.forEach((c) => c.studioId && usedStudioIds.add(c.studioId));
      byDay.push({ day: DAYS[dow], items });
    }
  }
  const studioRows = usedStudioIds.size
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, [...usedStudioIds]))
    : [];
  const studioName = new Map(studioRows.map((s) => [s.id, s.name]));

  // Coach customisation: their headline (split across two lines, sized to fit)
  // and an optional photo chip. The stock "Train / with me." keeps its
  // canonical split.
  const prefs = user.storyPrefs ?? {};
  const { line1, line2, size: hSize } = headlineOf(prefs.headline ?? "", ["Train", "with me."]);
  const showPhoto = prefs.showPhoto !== false && !!user.photo;
  // "Ironbound Performance Athletics" means nothing two towns over, so the
  // city is said once, from the profile. The studios on the rows say where in
  // town; this says which town.
  const city = (user.location ?? "").trim();

  // How much detail the week can carry: everything if it fits, the same rows
  // tighter if it doesn't, and a line a day when even that is too much.
  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({
        time: fmtTime(c.startTime),
        name: c.name,
        where: (c.studioId && studioName.get(c.studioId)) || c.location || "",
      })),
    })),
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78, !!city) / y.rowScale,
  );

  return renderStory({
    theme: t,
    style: y,
    format: "story",
    kicker:
      span === "week"
        ? `Week of ${new Date(`${todayIso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
        : "Today",
    line1,
    line2,
    headlineSize: hSize,
    city,
    photo: showPhoto ? user.photo : null,
    plan,
    empty: byDay.length === 0,
    emptyLine: "Nothing on the calendar yet.",
    verb: "Full schedule at",
    url: `fittlist.co/${user.handle ?? handle}`,
  });
}
