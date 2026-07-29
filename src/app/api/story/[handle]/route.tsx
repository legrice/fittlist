import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { brandIcon } from "@/lib/brand";
import { DAYS, fmtTime, runsOn, storyTheme, timeToMinutes } from "@/lib/format";

// v1.5 share image: 1080x1920 story PNG - Exhaust background, class list in
// Space Mono, fittlist.co/{handle} + cloud lockup as watermark. Layout scales
// the prototype share sheet's .story card (250px wide) by ~4.32.

export const dynamic = "force-dynamic";

const font = (file: string) =>
  readFileSync(join(process.cwd(), "public/fonts", file));

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 }[] | null = null;
function loadFonts() {
  if (!fonts) {
    // The brand typeface — Delight — across the whole share image. Satori needs
    // static TTFs (no woff2/variable), hence the .ttf copies in public/fonts.
    fonts = [
      { name: "Delight", data: font("delight-400.ttf"), weight: 400 },
      { name: "Delight", data: font("delight-600.ttf"), weight: 600 },
      { name: "Delight", data: font("delight-700.ttf"), weight: 700 },
      { name: "Delight", data: font("delight-800.ttf"), weight: 800 },
    ];
  }
  return fonts;
}

// Satori renders the block mark as an <img> (base64 SVG) and the "FittList"
// text natively in Archivo Black. The mark is red, recoloured only when it
// would vanish on the theme background (e.g. the red "Pop" theme).
function iconUri(color: string) {
  return `data:image/svg+xml;base64,${Buffer.from(brandIcon(color)).toString("base64")}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const params2 = new URL(req.url).searchParams;
  const span = params2.get("span") === "day" ? "day" : "week";
  const [, t] = storyTheme(params2.get("theme"));
  const markUri = iconUri(t.lockupAccent ?? t.accent);

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  const classRows = (
    await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id))
  ).filter((c) => c.isPublic); // shareable image: public classes only
  // The week image starts on *today* and runs the next 7 days (1 for "day").
  const todayIso = new Date().toISOString().slice(0, 10);
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
  let line1 = "Train";
  let line2 = "with me.";
  if (prefs.headline) {
    const words = prefs.headline.split(" ");
    const cut = Math.ceil(words.length / 2);
    line1 = words.slice(0, cut).join(" ");
    line2 = words.slice(cut).join(" ");
  }
  const maxLine = Math.max(line1.length, line2.length);
  const hSize = maxLine <= 9 ? 104 : maxLine <= 13 ? 86 : 70;
  const showPhoto = prefs.showPhoto !== false && !!user.photo;

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
          {span === "week"
            ? `Week of ${new Date(`${todayIso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
            : "Today"}
        </div>
        {showPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photo!}
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
            Nothing on the calendar yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {byDay.map(({ day, items }) => (
              <div key={day} style={{ display: "flex", flexDirection: "column" }}>
                {span === "week" && (
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
                )}
                {items.map((c) => (
                  <div
                    key={c.id}
                    style={{ display: "flex", gap: 34, marginBottom: 22 }}
                  >
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
                        {(c.studioId && studioName.get(c.studioId)) || c.location || ""}
                      </span>
                    </div>
                  </div>
                ))}
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
          <span style={{ fontWeight: 600, fontSize: 40 }}>
            fittlist.co/{handle}
          </span>
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
      // ImageResponse defaults to a year-long immutable cache, which kept
      // serving stale images (old copy, old schedule) from the CDN and the
      // phone after deploys. The image reflects the live schedule — never cache.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
