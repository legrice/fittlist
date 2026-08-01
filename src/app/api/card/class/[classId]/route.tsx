import { readFileSync } from "fs";
import { join } from "path";
import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { brandIcon } from "@/lib/brand";
import { fmtDateLong, fmtTime, runsOn, storyTheme, todayIso } from "@/lib/format";

// One class, as a 1080x1080 square for a story or a post.
//
// The profile card is about a person; this is about a night out. Same wardrobe
// (the story themes, the lockup, the accent rule) so the two read as a set,
// and the same shape: the mark at the top, the thing itself in the middle, the
// link at the bottom.
//
// The class photo carries it when there is one, edge to edge behind a scrim,
// exactly as the profile hero does. Without one it falls back to the coach's
// colour, which is the same fallback every other surface uses, so a class with
// no picture still makes a card worth sending.

export const dynamic = "force-dynamic";

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 }[] | null = null;
function loadFonts() {
  if (!fonts) {
    fonts = [
      { name: "Delight", data: font("delight-400.ttf"), weight: 400 },
      { name: "Delight", data: font("delight-600.ttf"), weight: 600 },
      { name: "Delight", data: font("delight-700.ttf"), weight: 700 },
      { name: "Delight", data: font("delight-800.ttf"), weight: 800 },
    ];
  }
  return fonts;
}

function iconUri(color: string) {
  return `data:image/svg+xml;base64,${Buffer.from(brandIcon(color)).toString("base64")}`;
}

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
  const who = isGym ? (studio?.name ?? owner.name) : owner.name;
  const where = studio?.name ?? c.location ?? "";
  const iso = search.get("d") || nextDate(c);
  const when = iso ? fmtDateLong(iso) : "";
  const link = isGym ? `fittlist.co/s/${studio?.slug ?? ""}` : `fittlist.co/${owner.handle ?? ""}`;

  const nameSize = c.name.length <= 14 ? 96 : c.name.length <= 22 ? 76 : c.name.length <= 32 ? 60 : 48;
  const ink = "#ffffff";

  return new ImageResponse(
    (
      // The frame carries no padding: Satori lays an absolute child out
      // against the padding box, so a picture inset by 80px and still 1080
      // wide hangs off the right edge. The padding lives on the content
      // column inside instead.
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: c.image ? "#101010" : avatarColor(owner),
          color: ink,
          fontFamily: "Delight",
          position: "relative",
        }}
      >
        {c.image && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.image}
              alt=""
              width={1080}
              height={1080}
              style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
            />
            {/* The same two scrims a profile wears: enough at the top for the
                lockup, enough at the bottom for the words, and the middle of
                the photograph left alone. */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 1080,
                height: 360,
                display: "flex",
                background: "linear-gradient(to bottom, rgba(0,0,0,.62), rgba(0,0,0,0))",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 480,
                left: 0,
                width: 1080,
                height: 600,
                display: "flex",
                background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.86))",
              }}
            />
          </>
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 20,
            background: t.accent,
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 1080,
            height: 1080,
            padding: "72px 80px 80px",
            position: "relative",
          }}
        >
        {/* The mark at the top, and across from it the one word that says what
            kind of thing this is. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconUri(ink)} alt="" width={44} height={45} />
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: -1.5 }}>FittList</span>
          </div>
          <div
            style={{
              display: "flex",
              background: t.accent,
              color: "#191502",
              padding: "10px 26px",
              borderRadius: 999,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            {c.specificDate ? "One off" : "Weekly"}
          </div>
        </div>

        {/* The class, at the bottom where the scrim is darkest. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 920 }}>
          {when && (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: 5,
                textTransform: "uppercase",
                color: t.accent,
              }}
            >
              {when} &middot; {fmtTime(c.startTime)}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: nameSize,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.02,
            }}
          >
            {c.name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 600,
              color: "rgba(255,255,255,.86)",
            }}
          >
            {[isGym ? null : `with ${who}`, where].filter(Boolean).join("  ·  ")}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 34,
              fontWeight: 700,
              color: "rgba(255,255,255,.72)",
            }}
          >
            {link}
          </div>
        </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: loadFonts(),
      // Same reasoning as the story image: it reflects the live class.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
