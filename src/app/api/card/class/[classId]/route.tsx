import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { cardFonts, classCard } from "@/lib/cardimage";
import { fmtDateLong, fmtTime, runsOn, storyTheme, todayIso } from "@/lib/format";

// One class, as a 1080x1080 square for a story or a post.
//
// The profile card is about a person; this is about a night out. Same wardrobe
// (the story themes, the lockup, the accent rule) so the two read as a set,
// and the same shape: the mark at the top, the thing itself in the middle, the
// link at the bottom. The drawing lives in lib/cardimage, because one of your
// own entries makes the same picture from a different row.

export const dynamic = "force-dynamic";

/** The next date this class runs, from today, or null if it has stopped. */
function nextDate(c: typeof schema.classes.$inferSelect): string | null {
  const start = new Date(`${todayIso()}T00:00:00Z`);
  for (let i = 0; i < 120; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (runsOn(c, iso, (d.getUTCDay() + 6) % 7)) return iso;
  }
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;
  const search = new URL(req.url).searchParams;
  const [, t] = storyTheme(search.get("theme"));

  const db = await getDb();
  const [c] = await db
    .select()
    .from(schema.classes)
    .where(and(eq(schema.classes.id, classId), eq(schema.classes.isPublic, true)));
  if (!c) return new Response("Not found", { status: 404 });

  const [owner] = await db.select().from(schema.users).where(eq(schema.users.id, c.userId));
  if (!owner) return new Response("Not found", { status: 404 });
  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // A gym is a place rather than a person, so its card says the place and
  // nothing about who is on the rota: that is the gym's own switch, and it is
  // off. A coach's card says the coach.
  const isGym = owner.kind === "gym";
  const iso = search.get("d") || nextDate(c);

  return new ImageResponse(
    classCard({
      image: c.image,
      fallback: avatarColor(owner),
      theme: t,
      when: iso ? `${fmtDateLong(iso)} · ${fmtTime(c.startTime)}` : "",
      name: c.name,
      meta: [isGym ? "" : `with ${owner.name}`, studio?.name ?? c.location ?? ""],
      link: isGym ? `fittlist.co/s/${studio?.slug ?? ""}` : `fittlist.co/${owner.handle ?? ""}`,
    }),
    {
      width: 1080,
      height: 1080,
      fonts: cardFonts(),
      // Same reasoning as the story image: it reflects the live class.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
