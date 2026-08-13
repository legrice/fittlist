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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f2",
          color: t.fg,
          fontFamily: "Delight",
          textAlign: "center",
          padding: "54px 80px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markUri} alt="" width={64} height={65} />
        <span
          style={{
            fontSize: 104,
            fontWeight: 800,
            lineHeight: .92,
            letterSpacing: -4,
            marginTop: 38,
          }}
        >
          Your week in fitness.
        </span>
        <span
          style={{
            fontSize: 34,
            fontWeight: 600,
            color: t.muted,
            marginTop: 30,
            lineHeight: 1.3,
          }}
        >
          Build your fitness calendar. Share it. See what everyone else is up to.
        </span>
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
