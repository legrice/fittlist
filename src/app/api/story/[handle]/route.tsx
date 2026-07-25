import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { BRAND_CLOUD, BRAND_INK } from "@/lib/brand";
import { DAYS, fmtTime, storyTheme, timeToMinutes } from "@/lib/format";

// v1.5 share image: 1080x1920 story PNG — Exhaust background, class list in
// Space Mono, fittlist.co/{handle} + cloud lockup as watermark. Layout scales
// the prototype share sheet's .story card (250px wide) by ~4.32.

export const dynamic = "force-dynamic";

const font = (file: string) =>
  readFileSync(join(process.cwd(), "src/assets/fonts", file));

let fonts: { name: string; data: Buffer; weight: 400 | 700 }[] | null = null;
function loadFonts() {
  if (!fonts) {
    fonts = [
      { name: "Archivo", data: font("archivo-700.ttf"), weight: 700 },
      { name: "Archivo Black", data: font("archivo-black.ttf"), weight: 400 },
      { name: "Space Mono", data: font("space-mono-400.ttf"), weight: 400 },
      { name: "Space Mono", data: font("space-mono-700.ttf"), weight: 700 },
    ];
  }
  return fonts;
}

// Satori needs base64 data URIs and explicit dimensions for <img>.
// Lockup viewBox is 5036x1164, so height 52 -> width ~225.
function lockupUri(variant: "cloud" | "ink", accentOverride?: string) {
  let svg = variant === "ink" ? BRAND_INK : BRAND_CLOUD;
  // Only the accent row/period is recolored when it would vanish on the
  // theme background — blocks are never rearranged.
  if (accentOverride) svg = svg.split("#DD583A").join(accentOverride);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const params2 = new URL(req.url).searchParams;
  const span = params2.get("span") === "day" ? "day" : "week";
  const [, t] = storyTheme(params2.get("theme"));
  const lockup = lockupUri(t.lockup, t.lockupAccent);

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  const classRows = await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id));
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
      .filter((c) => (c.specificDate ? c.specificDate === iso : c.dayOfWeek === dow))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    if (items.length) {
      items.forEach((c) => usedStudioIds.add(c.studioId));
      byDay.push({ day: DAYS[dow], items });
    }
  }
  const studioRows = usedStudioIds.size
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, [...usedStudioIds]))
    : [];
  const studioName = new Map(studioRows.map((s) => [s.id, s.name]));

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
          fontFamily: "Archivo",
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
            fontFamily: "Space Mono",
            fontSize: 37,
            letterSpacing: 7,
            textTransform: "uppercase",
            color: t.muted,
            marginBottom: 34,
          }}
        >
          {span === "week"
            ? `Week of ${new Date(`${todayIso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
            : "Today"}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Archivo Black",
            fontSize: 112,
            lineHeight: 0.95,
            letterSpacing: -2,
            textTransform: "uppercase",
            marginBottom: 78,
          }}
        >
          <span>Train</span>
          <span style={{ color: t.accent }}>with me.</span>
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
                      fontFamily: "Space Mono",
                      fontSize: 37,
                      letterSpacing: 6,
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
                        fontFamily: "Space Mono",
                        fontSize: 43,
                        fontWeight: 700,
                        color: t.time,
                        width: 190,
                        flexShrink: 0,
                        display: "flex",
                      }}
                    >
                      {fmtTime(c.startTime)}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 48, fontWeight: 700 }}>{c.name}</span>
                      <span style={{ fontSize: 41, color: t.faint }}>
                        {studioName.get(c.studioId) ?? ""}
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
          <span style={{ fontFamily: "Space Mono", fontSize: 43 }}>
            fittlist.co/{handle}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lockup} alt="" width={225} height={52} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: loadFonts() },
  );
}
