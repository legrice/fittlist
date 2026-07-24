import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { BRAND_CLOUD } from "@/lib/brand";
import { DAYS, fmtTime, timeToMinutes } from "@/lib/format";

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
const LOCKUP_URI = `data:image/svg+xml;base64,${Buffer.from(BRAND_CLOUD).toString("base64")}`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const span = new URL(req.url).searchParams.get("span") === "day" ? "day" : "week";

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  let classRows = await db.select().from(schema.classes).where(eq(schema.classes.userId, user.id));
  if (span === "day") {
    const todayMon0 = (new Date().getUTCDay() + 6) % 7; // 0 = Monday
    classRows = classRows.filter((c) => c.dayOfWeek === todayMon0);
  }
  const studioIds = [...new Set(classRows.map((c) => c.studioId))];
  const studioRows = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioName = new Map(studioRows.map((s) => [s.id, s.name]));

  const byDay = DAYS.map((day, di) => ({
    day,
    items: classRows
      .filter((c) => c.dayOfWeek === di)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
  })).filter((d) => d.items.length);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#191502",
          color: "#ffffff",
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
            background: "#DD583A",
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
            color: "#C9C3AE",
            marginBottom: 34,
          }}
        >
          {span === "week" ? "This week" : "Today"} · on the floor
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
          <span>Catch me</span>
          <span style={{ color: "#DD583A" }}>coaching.</span>
        </div>

        {byDay.length === 0 ? (
          <div style={{ display: "flex", color: "#8A8570", fontSize: 44 }}>
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
                      color: "#8A8570",
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
                        color: "#DAD4BE",
                        width: 190,
                        flexShrink: 0,
                        display: "flex",
                      }}
                    >
                      {fmtTime(c.startTime)}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 48, fontWeight: 700 }}>{c.name}</span>
                      <span style={{ fontSize: 41, color: "#8A8570" }}>
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
          <img src={LOCKUP_URI} alt="" width={225} height={52} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: loadFonts() },
  );
}
