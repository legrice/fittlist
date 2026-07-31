import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { brandIcon } from "@/lib/brand";
import { DAYS, fmtTime, runsOn, storyTheme, timeToMinutes, todayIso as todayIsoNow } from "@/lib/format";
import { listBudget, planStory } from "@/lib/storyplan";

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
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78),
  );
  // Tier 1 is the poster as it has always looked; tier 2 is the same shape
  // with the air taken out of it.
  const m =
    plan.tier === 1
      ? { dayFs: 34, dayMt: 34, dayMb: 17, timeFs: 43, timeW: 172, gap: 34, nameFs: 48, subFs: 41, rowMb: 22, colW: 702 }
      : { dayFs: 30, dayMt: 26, dayMb: 13, timeFs: 38, timeW: 150, gap: 30, nameFs: 42, subFs: 36, rowMb: 18, colW: 728 };

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

        {/* What every class has in common, said once instead of on every row. */}
        {plan.lifted && (
          <div style={{ display: "flex", fontSize: 36, color: t.faint, marginBottom: 30 }}>
            {plan.lifted}
          </div>
        )}

        {byDay.length === 0 ? (
          <div style={{ display: "flex", color: t.faint, fontSize: 44 }}>
            Nothing on the calendar yet.
          </div>
        ) : plan.tier === 3 ? (
          // A line a day: the same class twice becomes one name with both its
          // times, so a week reads as a shape rather than a wall.
          <div style={{ display: "flex", flexDirection: "column" }}>
            {plan.summary.map(({ day, entries }) => (
              <div key={day} style={{ display: "flex", marginBottom: 26 }}>
                {span === "week" && (
                  <span
                    style={{
                      display: "flex",
                      width: 118,
                      flexShrink: 0,
                      // Sits on the first line's baseline, whatever size the
                      // week ended up being said in.
                      paddingTop: Math.max(2, Math.round((plan.summaryFs * 1.3 - 36) / 2)),
                      fontWeight: 600,
                      fontSize: 30,
                      letterSpacing: 3,
                      textTransform: "uppercase",
                      color: t.faint,
                    }}
                  >
                    {day}
                  </span>
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: span === "week" ? 764 : 908,
                    fontSize: plan.summaryFs,
                    lineHeight: 1.3,
                  }}
                >
                  {/* The name carries the weight and its times sit back from
                      it, so the line reads as what, then when. */}
                  {entries.map((e) => (
                    <div key={e.name} style={{ display: "flex" }}>
                      <span style={{ fontWeight: 700 }}>{e.name}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: t.muted,
                          marginLeft: Math.round(plan.summaryFs * 0.32),
                        }}
                      >
                        {e.times}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {plan.moreDays > 0 && (
              <div style={{ display: "flex", fontSize: 34, color: t.faint, marginTop: 12 }}>
                + {plan.moreDays} more {plan.moreDays === 1 ? "day" : "days"} at fittlist.co/
                {handle}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {plan.days.map(({ day, rows }) => (
              <div key={day} style={{ display: "flex", flexDirection: "column" }}>
                {span === "week" && (
                  <div
                    style={{
                      display: "flex",
                      fontWeight: 600,
                      fontSize: m.dayFs,
                      letterSpacing: 4,
                      textTransform: "uppercase",
                      color: t.faint,
                      margin: `${m.dayMt}px 0 ${m.dayMb}px`,
                    }}
                  >
                    {day}
                  </div>
                )}
                {rows.map((r, i) => (
                  <div
                    key={`${day}-${i}`}
                    style={{ display: "flex", gap: m.gap, marginBottom: m.rowMb }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: m.timeFs,
                        color: t.time,
                        width: m.timeW,
                        flexShrink: 0,
                        display: "flex",
                      }}
                    >
                      {r.time}
                    </span>
                    {/* Bounded, so a long class name wraps rather than running
                        off the edge. See the note in /api/story/me. */}
                    <div style={{ display: "flex", flexDirection: "column", width: m.colW }}>
                      <span style={{ fontSize: m.nameFs, fontWeight: 700, lineHeight: 1.15 }}>
                        {r.name}
                      </span>
                      {r.sub && (
                        <span style={{ fontSize: m.subFs, color: t.faint, lineHeight: 1.2 }}>
                          {r.sub}
                        </span>
                      )}
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
