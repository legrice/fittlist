import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { brandIcon } from "@/lib/brand";

// The link preview card: 1200x630, the shape iMessage, Slack, WhatsApp and
// every other unfurler expects.
//
// The profile photo is stored as a small data URL on the account, and a data
// URL in an og:image tag gets nothing: scrapers fetch a URL over HTTP, they
// don't decode one. Pointing the tag straight at users.photo meant every shared
// profile unfurled as a bare title with no image at all. This route is a real
// URL, and it composes the photo into a card rather than shipping the bare
// square, so a share carries the person's face, their name and their link.

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) return new Response("Not found", { status: 404 });

  const markUri = `data:image/svg+xml;base64,${Buffer.from(brandIcon("#020D08")).toString("base64")}`;
  const colour = avatarColor({ id: user.id, avatarColor: user.avatarColor });
  const initial = (user.name.trim().charAt(0) || "?").toUpperCase();

  // A coach's line is what they do; a member's is where they are. Neither is
  // guaranteed, so the card has to read with any of them missing.
  const isCoach = user.kind !== "fan";
  const line = [user.title?.trim(), user.location?.trim()].filter(Boolean).join(" · ");
  const fallback = isCoach ? "Coach on fittlist" : "On fittlist";

  // Long names would otherwise run under the photo.
  const nameSize = user.name.length <= 14 ? 92 : user.name.length <= 22 ? 74 : 58;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#8CF25F",
          color: "#020D08",
          padding: "76px 84px",
          fontFamily: "Delight",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photo}
              alt=""
              width={248}
              height={248}
              style={{
                borderRadius: 999,
                objectFit: "cover",
                boxShadow: "0 18px 60px rgba(23, 26, 31, .28)",
                flexShrink: 0,
              }}
            />
          ) : (
            // No photo: the same coloured initial the app shows everywhere else,
            // so the preview and the profile are recognisably one person.
            <div
              style={{
                width: 248,
                height: 248,
                borderRadius: 999,
                background: colour,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 124,
                fontWeight: 800,
                boxShadow: "0 18px 60px rgba(23, 26, 31, .28)",
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
            <span
              style={{
                fontSize: nameSize,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -2,
              }}
            >
              {user.name}
            </span>
            <span style={{ fontSize: 40, fontWeight: 600, color: "#020D08", marginTop: 18 }}>
              {line || fallback}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {isCoach && (
              <span style={{ fontSize: 34, fontWeight: 600, color: "#020D08", marginBottom: 10 }}>
                Every studio, one schedule
              </span>
            )}
            <span style={{ fontSize: 44, fontWeight: 700 }}>fittlist.co/{handle}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={45} height={46} />
            <span style={{ fontWeight: 800, fontSize: 44, letterSpacing: -1.5 }}>FittList</span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: loadFonts(),
      // Same reason as the story image: ImageResponse would otherwise hand the
      // CDN a year-long immutable cache and keep serving the old photo and name
      // long after someone changed either.
      headers: { "Cache-Control": "no-store" },
    },
  );
}
