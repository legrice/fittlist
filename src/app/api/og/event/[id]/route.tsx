import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { brandIcon } from "@/lib/brand";
import { fmtTime } from "@/lib/format";

// The event's link preview: the flyer when there is one, the facts beside it,
// so the unfurl in a group chat is the poster the host already made.

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
const PAPER = "#faf8f2";
const INK = "#191502";
const MUTED = "#6b6555";
const SI = "#dd6a35";

const dayBits = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return { wd: WD[(d.getUTCDay() + 6) % 7], mon: MO[d.getUTCMonth()], day: d.getUTCDate() };
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, id));
  if (!ev) return new Response("Not found", { status: 404 });

  const b = dayBits(ev.startDate);
  const multi = ev.endDate !== ev.startDate;
  const end = dayBits(ev.endDate);
  const whenLine = multi
    ? `${b.wd}, ${b.mon} ${b.day} to ${end.wd}, ${end.mon} ${end.day}`
    : `${b.wd}, ${b.mon} ${b.day}${ev.startTime ? ` · ${fmtTime(ev.startTime)}` : ""}`;
  const host = ev.hostName?.trim() || "";
  const markUri = `data:image/svg+xml;base64,${Buffer.from(brandIcon(SI)).toString("base64")}`;
  const nameSize = ev.name.length <= 16 ? 80 : ev.name.length <= 28 ? 62 : 48;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          color: INK,
          fontFamily: "Delight",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 56px 64px 72px",
            width: ev.photo ? 660 : 1200,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: 150,
                height: 164,
                borderRadius: 28,
                background: "#ffffff",
                boxShadow: "0 18px 60px rgba(23, 26, 31, .22)",
                marginBottom: 40,
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: 3, color: SI }}>
                {b.mon.toUpperCase()}
              </span>
              <span style={{ fontSize: 80, fontWeight: 800, lineHeight: 1, marginTop: 2 }}>
                {b.day}
              </span>
            </div>
            <span style={{ fontSize: nameSize, fontWeight: 800, lineHeight: 1.03, letterSpacing: -2 }}>
              {ev.name}
            </span>
            <span style={{ fontSize: 34, fontWeight: 700, marginTop: 18 }}>{whenLine}</span>
            <span style={{ fontSize: 30, fontWeight: 600, color: MUTED, marginTop: 6 }}>
              {ev.place}
            </span>
            {host && (
              <span style={{ fontSize: 28, fontWeight: 600, color: MUTED, marginTop: 6 }}>
                Hosted by {host}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={37} height={38} />
            <span style={{ fontWeight: 800, fontSize: 36, letterSpacing: -1.2 }}>FittList</span>
          </div>
        </div>
        {ev.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ev.photo}
            alt=""
            width={540}
            height={630}
            style={{ objectFit: "cover" }}
          />
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: loadFonts(),
      headers: { "Cache-Control": "no-store" },
    },
  );
}
