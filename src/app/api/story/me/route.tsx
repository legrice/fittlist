import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { brandIcon } from "@/lib/brand";
import { DAYS, fmtTime, storyTheme, timeToMinutes } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

// The member's share image: the classes they marked "going" this week, across
// every coach and studio. The mirror of the coach's "Train with me" — this one
// says "come with me", and it carries the coaches' names out to the member's
// friends, who are exactly the people most likely to show up.

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

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;
  const [, t] = storyTheme(qs.get("theme"));
  const markUri = iconUri(t.lockupAccent ?? t.accent);

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  const going = await db
    .select({
      classId: schema.attendances.classId,
      occurrenceDate: schema.attendances.occurrenceDate,
    })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));
  const classIds = [...new Set(going.map((g) => g.classId))];
  const classRows = classIds.length
    ? (await db.select().from(schema.classes).where(inArray(schema.classes.id, classIds))).filter(
        (c) => c.isPublic,
      )
    : [];

  const coachIds = [...new Set(classRows.map((c) => c.userId))];
  const coaches = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  const studioIds = [...new Set(classRows.map((c) => c.studioId).filter((x): x is string => !!x))];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioName = new Map(studios.map((s) => [s.id, s.name]));

  // Group by the days they actually marked — the image is their commitments,
  // not every occurrence of a class they sometimes attend.
  const classById = new Map(classRows.map((c) => [c.id, c]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const endIso = new Date(Date.parse(`${todayIso}T00:00:00Z`) + 7 * 864e5)
    .toISOString()
    .slice(0, 10);
  const dates = [
    ...new Set(
      going
        .filter(
          (g) =>
            classById.has(g.classId) && g.occurrenceDate >= todayIso && g.occurrenceDate < endIso,
        )
        .map((g) => g.occurrenceDate),
    ),
  ].sort();
  const byDay = dates.map((iso) => {
    const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
    const items = going
      .filter((g) => g.occurrenceDate === iso)
      .map((g) => classById.get(g.classId))
      .filter((c): c is (typeof classRows)[number] => !!c)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    return { day: DAYS[dow], items };
  }).filter((d) => d.items.length > 0);

  const prefs = me.storyPrefs ?? {};
  let line1 = "Come train";
  let line2 = "with me.";
  if (prefs.headline) {
    const words = prefs.headline.split(" ");
    const cut = Math.ceil(words.length / 2);
    line1 = words.slice(0, cut).join(" ");
    line2 = words.slice(cut).join(" ");
  }
  const maxLine = Math.max(line1.length, line2.length);
  const hSize = maxLine <= 9 ? 104 : maxLine <= 13 ? 86 : 70;
  const showPhoto = prefs.showPhoto !== false && !!me.photo;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: t.bg,
          color: t.fg,
          padding: "104px 86px",
          fontFamily: "Delight",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 26,
            background: t.accent,
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: t.muted,
            marginBottom: 30,
          }}
        >
          {`My week of ${new Date(`${todayIso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
        </div>
        {showPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.photo!}
            alt=""
            width={172}
            height={172}
            style={{
              position: "absolute",
              top: 96,
              right: 86,
              borderRadius: 999,
              objectFit: "cover",
              borderWidth: 8,
              borderStyle: "solid",
              borderColor: t.accent,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontWeight: 800,
            fontSize: hSize,
            lineHeight: 0.98,
            letterSpacing: -3,
            textTransform: "uppercase",
            marginBottom: 78,
            maxWidth: showPhoto ? 690 : 908,
          }}
        >
          <span>{line1}</span>
          {line2 && <span style={{ color: t.accent }}>{line2}</span>}
        </div>

        {byDay.length === 0 ? (
          <div style={{ display: "flex", color: t.faint, fontSize: 44 }}>
            Nothing marked yet this week.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {byDay.map(({ day, items }) => (
              <div key={day} style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    fontWeight: 600,
                    fontSize: 34,
                    letterSpacing: 4,
                    textTransform: "uppercase",
                    color: t.faint,
                    margin: "34px 0 17px",
                  }}
                >
                  {day}
                </div>
                {items.map((c) => {
                  const where = (c.studioId && studioName.get(c.studioId)) || c.location || "";
                  const coach = coachById.get(c.userId)?.name?.trim().split(/\s+/)[0] ?? "";
                  return (
                    <div key={c.id} style={{ display: "flex", gap: 34, marginBottom: 22 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 43,
                          color: t.time,
                          width: 172,
                          flexShrink: 0,
                          display: "flex",
                        }}
                      >
                        {fmtTime(c.startTime)}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 48, fontWeight: 700 }}>{c.name}</span>
                        <span style={{ fontSize: 41, color: t.faint }}>
                          {[coach, where].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 40 }}>fittlist.co</span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={56} height={57} />
            <span style={{ fontWeight: 800, fontSize: 50, color: t.fg, letterSpacing: -2 }}>
              FittList
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: loadFonts(),
      headers: { "Cache-Control": "no-store" },
    },
  );
}
