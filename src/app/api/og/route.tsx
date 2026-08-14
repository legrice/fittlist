import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand";
import { STORY_THEMES } from "@/lib/format";

// The site's own link preview: the landing message, without a product
// screenshot. It is deliberately spare so the promise survives even at the
// small sizes Messages and social feeds use for link cards.

export const dynamic = "force-static";

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));

export async function GET() {
  const t = STORY_THEMES.paper;
  const markUri = `data:image/svg+xml;base64,${Buffer.from(brandIcon(t.accent)).toString("base64")}`;
  const yogaUri = `data:image/png;base64,${readFileSync(
    join(process.cwd(), "public/illustrations/following-empty.png"),
  ).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "center",
          background: "#faf8f2",
          color: t.fg,
          fontFamily: "Delight",
          padding: "50px 68px 44px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markUri} alt="" width={42} height={43} />
          <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: -1.4 }}>FittList</span>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", width: 790, flexDirection: "column", alignItems: "flex-start" }}>
            <span
              style={{
                fontSize: 96,
                fontWeight: 800,
                lineHeight: .92,
                letterSpacing: -4,
              }}
            >
              Your week in fitness.
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 700,
                fontSize: 31,
                fontWeight: 600,
                color: t.muted,
                marginTop: 28,
                lineHeight: 1.28,
              }}
            >
              <span>Build your fitness calendar. Share it.</span>
              <span>See what everyone else is up to.</span>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={yogaUri} alt="" width={230} height={388} style={{ objectFit: "contain", alignSelf: "flex-end" }} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Delight", data: font("delight-600.ttf"), weight: 600 },
        { name: "Delight", data: font("delight-800.ttf"), weight: 800 },
      ],
      // Unlike a profile card there's nothing here that changes with an
      // account, so the default long cache is what we want.
    },
  );
}
