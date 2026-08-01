import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { cardFonts, classCard } from "@/lib/cardimage";
import { fmtDateLong, fmtTime, storyTheme } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { personalNext } from "@/lib/week";

// One of your own entries, as the same square card a public class makes.
//
// A personal class has no page and never will, so this is the one thing that
// can leave: a picture, handed to the person who wrote it down. It is drawn
// only for them (the session owns the row, and there is no id anyone else can
// guess their way into), and nothing is published by asking for it. Posting
// the file afterwards is theirs to decide, which is the same deal as a photo
// out of the camera roll.
//
// The link line says fittlist.co rather than a profile: the class isn't on
// one, and pointing at a page that doesn't list it would be a small lie.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [, t] = storyTheme(new URL(req.url).searchParams.get("theme"));

  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [p] = await db
    .select()
    .from(schema.personalClasses)
    .where(and(eq(schema.personalClasses.id, id), eq(schema.personalClasses.userId, userId)));
  if (!p) return new Response("Not found", { status: 404 });

  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const [studio] = p.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, p.studioId))
    : [];

  const iso = personalNext(p);

  return new ImageResponse(
    classCard({
      image: p.image,
      fallback: me ? avatarColor(me) : "#191502",
      theme: t,
      kind: p.specificDate ? "One off" : "Weekly",
      when: iso ? `${fmtDateLong(iso)} · ${fmtTime(p.startTime)}` : "",
      name: p.name,
      meta: [p.withWho ? `with ${p.withWho}` : "", studio?.name ?? p.location ?? ""],
      link: "fittlist.co",
    }),
    {
      width: 1080,
      height: 1080,
      fonts: cardFonts(),
      // Somebody's own row, behind their session: never a shared cache.
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}
