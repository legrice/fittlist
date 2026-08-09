import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { publicSchedule } from "@/lib/coachweek";
import { avatarColor } from "@/lib/avatar";
import { brandIcon } from "@/lib/brand";
import { runsOn, storyTheme, todayIso as todayIsoNow } from "@/lib/format";

// The profile card: a 1080x1080 Instagram square about a person, not their
// schedule. The face carries it; under it the kind pill, the name, who they
// are, and the link. Same theme set as the story image, so the two share a
// wardrobe.

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const search = new URL(req.url).searchParams;
  const [, t] = storyTheme(search.get("theme"));
  const markUri = iconUri(t.lockupAccent ?? t.accent);

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  const isCoach = user.kind !== "fan";
  const name = user.name.trim() || user.email.split("@")[0];
  const initial = (name.charAt(0) || "?").toUpperCase();

  // One quiet line of proof for coaches: how much is on this week. Counted,
  // never listed; the schedule has its own image.
  let classesThisWeek = 0;
  if (isCoach) {
    const classRows = (await publicSchedule(user)).filter((c) => c.isPublic);
    const start = new Date(`${todayIsoNow()}T00:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      classesThisWeek += classRows.filter((c) => runsOn(c, iso, dow)).length;
    }
  }

  const sub = [user.title?.trim(), user.location?.trim()].filter(Boolean).join("  ·  ");
  // Scale the name to fit one line; long names get smaller, never clipped.
  const nameSize = name.length <= 12 ? 104 : name.length <= 18 ? 84 : name.length <= 26 ? 66 : 52;

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
          padding: "72px 80px 80px",
          fontFamily: "Delight",
        }}
      >
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
        {/* the lockup up top, and a single accent dot across from it */}
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
            <img src={markUri} alt="" width={44} height={45} />
            <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: -1.5 }}>FittList</span>
          </div>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: t.accent,
              display: "flex",
            }}
          />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 40,
          }}
        >
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo}
              alt=""
              width={400}
              height={400}
              style={{
                borderRadius: 999,
                objectFit: "cover",
                borderWidth: 10,
                borderStyle: "solid",
                borderColor: t.accent,
              }}
            />
          ) : (
            <div
              style={{
                width: 400,
                height: 400,
                borderRadius: 999,
                background: avatarColor(user),
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 190,
                fontWeight: 800,
                borderWidth: 10,
                borderStyle: "solid",
                borderColor: t.accent,
              }}
            >
              {initial}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: nameSize,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 1,
                textTransform: "uppercase",
                textAlign: "center",
                maxWidth: 920,
              }}
            >
              {name}
            </div>
            {sub && (
              <div
                style={{
                  display: "flex",
                  fontSize: 34,
                  fontWeight: 600,
                  color: t.muted,
                  textAlign: "center",
                  maxWidth: 880,
                }}
              >
                {sub}
              </div>
            )}
            {classesThisWeek > 0 && (
              <div
                style={{
                  display: "flex",
                  fontSize: 27,
                  fontWeight: 700,
                  letterSpacing: 5,
                  textTransform: "uppercase",
                  color: t.faint,
                }}
              >
                {classesThisWeek} {classesThisWeek === 1 ? "class" : "classes"} this week
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: 38,
            fontWeight: 700,
          }}
        >
          <span style={{ color: t.faint }}>fittlist.co/</span>
          <span style={{ color: t.fg }}>{handle}</span>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      fonts: loadFonts(),
      // Same reasoning as the story image: it reflects the live profile.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
