import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";
import { getDb, schema } from "@/db";
import { todayIso } from "@/lib/format";
import { shareWeek } from "@/lib/shareweek";
import { getSessionUserId } from "@/lib/session";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";

// One screen, two addresses: page modules cannot export shared helpers, so
// both route pages call this renderer from a route-adjacent non-page module.
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
  if (!me?.handle) redirect("/you");

  const coach = me.kind !== "fan";
  if (coach && address === "member") redirect("/coachshare");
  if (!coach && address === "coach") redirect("/membershare");

  const today = todayIso();
  let defaultFrom = today;
  const days = await shareWeek(userId, defaultFrom, 14);
  const items: HubItem[] = days.flatMap((d) =>
    d.items.map((it) => ({
      key: it.key,
      iso: it.iso,
      time: it.time,
      name: it.name,
      where: it.where,
      own: it.own,
      coaching: it.coaching,
    })),
  );
  defaultFrom = days[0]?.iso ?? defaultFrom;

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
    if (templates.length) {
      lastUsed = {
        startTime: templates[0].startTime,
        durationMin: templates[0].durationMin,
        studioId: templates[0].studioId,
      };
    }
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
      studios={studios}
      templates={templates}
      customTypes={customTypes}
      lastUsed={lastUsed}
    />
  );
}
