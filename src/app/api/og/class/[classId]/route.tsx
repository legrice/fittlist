import { safeServerImage } from "@/lib/server-image";
import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { brandIcon } from "@/lib/brand";
import { fmtTime, runsOn, todayIso } from "@/lib/format";

// The mini event poster: what a shared class link unfurls into. Joanne sees
// what it is, when, where and with whom before she ever taps, so the text
// message carries the plan, not a mystery URL. The ?d= the share links carry
// picks the occurrence, which is what makes the poster dynamic: the same
// class shared for two different Fridays makes two different posters.

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

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAPER = "#8CF25F";
const INK = "#020D08";
const MUTED = "#020D08";
const SI = "#020D08";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ classId: string }> },
) {
  const { classId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(classId)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [c] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!c || !c.isPublic) return new Response("Not found", { status: 404 });
  const [coach] = await db.select().from(schema.users).where(eq(schema.users.id, c.userId));
  if (!coach) return new Response("Not found", { status: 404 });
  const [studio] = c.studioId
    ? await db.select().from(schema.studios).where(eq(schema.studios.id, c.studioId))
    : [];

  // The occurrence: the shared link's ?d= when the class actually runs then,
  // otherwise the next date it does, same rule as the page itself.
  const dowOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const url = new URL(req.url);
  const asked = url.searchParams.get("d");
  let whenIso =
    asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && runsOn(c, asked, dowOf(asked)) ? asked : null;
  if (!whenIso) {
    whenIso = c.specificDate;
    if (!whenIso) {
      const start = new Date(`${todayIso()}T00:00:00Z`);
      for (let i = 0; i < 366 && !whenIso; i++) {
        const day = new Date(start);
        day.setUTCDate(start.getUTCDate() + i);
        const iso = day.toISOString().slice(0, 10);
        if (runsOn(c, iso, (day.getUTCDay() + 6) % 7)) whenIso = iso;
      }
      whenIso = whenIso ?? todayIso();
    }
  }
  const d = new Date(`${whenIso}T00:00:00Z`);
  const wd = WD[(d.getUTCDay() + 6) % 7];
  const mon = MO[d.getUTCMonth()];
  const day = d.getUTCDate();

  const place = studio?.name ?? c.location ?? "";
  // ?g={handle}: the sharer, so the poster says who's going. Resolved to a
  // real account so a link can't be dressed up with an arbitrary name.
  const g = url.searchParams.get("g");
  let goer: string | null = null;
  if (g && /^[a-z0-9-]{1,40}$/i.test(g)) {
    const [gu] = await db.select().from(schema.users).where(eq(schema.users.handle, g));
    if (gu?.name.trim()) goer = gu.name.trim();
  }
  const markUri = `data:image/svg+xml;base64,${Buffer.from(brandIcon(SI)).toString("base64")}`;
  const colour = avatarColor(coach);
  const initial = (coach.name.trim().charAt(0) || "?").toUpperCase();
  const nameSize = c.name.length <= 14 ? 88 : c.name.length <= 24 ? 70 : 54;

  const safePhoto = await safeServerImage(coach.photo);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "64px 72px",
          fontFamily: "Delight",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 52 }}>
          {/* The date tile from the events board, poster-sized, floating on
              the paper like everything else in this family. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 190,
              height: 210,
              borderRadius: 34,
              background: "#ffffff",
              boxShadow: "0 18px 60px rgba(23, 26, 31, .22)",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: 4, color: SI }}>
              {mon.toUpperCase()}
            </span>
            <span style={{ fontSize: 104, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>{day}</span>
            <span style={{ fontSize: 30, fontWeight: 600, color: MUTED, marginTop: 6 }}>{wd}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 830 }}>
            {goer && (
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  letterSpacing: 2,
                  color: SI,
                  marginBottom: 14,
                }}
              >
                {goer.toUpperCase()} IS GOING
              </span>
            )}
            <span style={{ fontSize: nameSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
              {c.name}
            </span>
            <span style={{ fontSize: 40, fontWeight: 700, marginTop: 20 }}>
              {fmtTime(c.startTime)} · {c.durationMin} min
            </span>
            {place && (
              <span style={{ fontSize: 34, fontWeight: 600, color: MUTED, marginTop: 8 }}>
                {place}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {safePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safePhoto!}
                alt=""
                width={84}
                height={84}
                style={{ borderRadius: 999, objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 999,
                  background: colour,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 42,
                  fontWeight: 800,
                }}
              >
                {initial}
              </div>
            )}
            <span style={{ fontSize: 38, fontWeight: 700 }}>with {coach.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={41} height={42} />
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: -1.5 }}>FittList</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: loadFonts(),
      // The poster names a date and a time that the coach can edit; a cached
      // year-old card would lie.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
