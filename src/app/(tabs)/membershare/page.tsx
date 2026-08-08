import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import { getSessionUserId } from "@/lib/session";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";

export const dynamic = "force-dynamic";

// The Share tab's screen. A coach gets one surface with Week, Profile and QR
// code as segments; a member gets the Week alone, and builds it right here:
// the hub is where they add the classes they're going to, and the picture is
// what the adding was for. It lives in the tabs group so the bar stays under
// it; Share is a place you go, not a sheet that visits.
//
// One screen, two addresses, by Matt's call: a member's is /membershare and
// a coach's is /coachshare, and each kind is bounced to its own, the same
// rule that keeps /app and /week apart. This builder is the whole page and
// both routes call it, so there is nothing here to drift.
export async function hubPage(address: "member" | "coach") {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({
      kind: schema.users.kind,
      handle: schema.users.handle,
      name: schema.users.name,
      storyPrefs: schema.users.storyPrefs,
      photo: schema.users.photo,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  // No handle means mid-signup, and nothing here works without a page to
  // point at; /you sorts out where they should be.
  if (!me?.handle) redirect("/you");

  const coach = me.kind !== "fan";
  if (coach && address === "member") redirect("/coachshare");
  if (!coach && address === "coach") redirect("/membershare");
  // A fortnight of what the picture could hold, for the Dates and Classes
  // pickers: the range moves client-side, so the screen gets the whole
  // window and filters. Same loader as the image route, so the picker and
  // the picture cannot disagree about what exists. `shareWeek` answers by
  // kind: a coach's teaching week, a member's marks and dated entries.
  const today = todayIso();
  let defaultFrom = today;
  const days = await shareWeek(userId, defaultFrom, 14);
  const items: HubItem[] = days.flatMap((d) =>
    d.items.map((it) => ({ key: it.key, iso: it.iso, time: it.time, name: it.name, where: it.where })),
  );
  // Start where the week has something: the empty poster should never be
  // the first one anybody sees.
  defaultFrom = days[0]?.iso ?? defaultFrom;

  // A member builds their week here, so the hub carries the adder and the
  // adder's ingredients: the studio directory, their own saved classes, the
  // shared type list. A coach's hub never opens it, so theirs stay empty
  // rather than loading three queries nobody reads.
  let studios: StudioDto[] = [];
  let templates: TemplateDto[] = [];
  let customTypes: string[] = [];
  let lastUsed: LastUsed = { startTime: "18:00", durationMin: 60, studioId: null };
  if (!coach) {
    const [studioRows, templateRows, customTypeRows] = await Promise.all([
      db.select().from(schema.studios).orderBy(schema.studios.seq),
      db
        .select()
        .from(schema.classTemplates)
        .where(eq(schema.classTemplates.userId, userId))
        .orderBy(desc(schema.classTemplates.updatedAt)),
      db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
    ]);
    studios = studioRows.map((s) => ({
      id: s.id,
      seq: s.seq,
      slug: s.slug,
      name: s.name,
      address: s.address,
    }));
    templates = templateRows.map((t) => ({
      name: t.name,
      classType: t.classType,
      description: t.description,
      image: t.image,
      startTime: t.startTime,
      durationMin: t.durationMin,
      studioId: t.studioId,
      location: t.location,
      withWho: t.withWho,
      isPublic: t.isPublic,
      links: t.links,
    }));
    customTypes = customTypeRows.map((r) => r.name);
    if (templates.length)
      lastUsed = {
        startTime: templates[0].startTime,
        durationMin: templates[0].durationMin,
        studioId: templates[0].studioId,
      };
  }

  return (
    <ShareHubScreen
      coach={coach}
      handle={me.handle}
      name={me.name.trim() || me.handle}
      items={items}
      defaultFrom={defaultFrom}
      today={today}
      savedHeadline={me.storyPrefs?.headline ?? ""}
      hasPhoto={!!me.photo}
      studios={studios}
      templates={templates}
      customTypes={customTypes}
      lastUsed={lastUsed}
    />
  );
}

export default async function MemberSharePage() {
  return hubPage("member");
}
