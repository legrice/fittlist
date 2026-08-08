import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand";
import { STORY_THEMES } from "@/lib/format";

// The site's own link preview: what fittlist.co unfurls as when the link is
// the product rather than a person. Same 1200x630 shape and the same paper,
// orange rule and lockup as a profile card, so a share of the site and a share
// of a coach read as the same place. The big mark gave its spot to the app
// itself: the landing hero's phone, which shows what the link opens.

export const dynamic = "force-static";

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));

export async function GET() {
  const t = STORY_THEMES.paper;
  const markUri = `data:image/svg+xml;base64,${Buffer.from(brandIcon(t.accent)).toString("base64")}`;
  // The phone, cut out on a transparent PNG, so it floats on the same paper
  // as the words: one tone, no panel behind it.
  const phoneUri = `data:image/png;base64,${readFileSync(
    join(process.cwd(), "public/phone-og.png"),
  ).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#faf8f2",
          color: t.fg,
          fontFamily: "Delight",
        }}
      >
        {/* the words, on the left */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "72px 24px 64px 84px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={48} height={49} />
            <span style={{ fontWeight: 800, fontSize: 46, letterSpacing: -1.5 }}>FittList</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* One line, always: the size is set so the three words fit. */}
            <span style={{ fontSize: 88, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>
              Find your fit
            </span>
            <span
              style={{
                fontSize: 33,
                fontWeight: 600,
                color: t.muted,
                marginTop: 24,
                lineHeight: 1.3,
                maxWidth: 580,
              }}
            >
              Follow coaches. Build your schedule. Stay connected to your local fitness community.
            </span>
          </div>
          <span style={{ fontSize: 42, fontWeight: 700 }}>fittlist.co</span>
        </div>

        {/* the app, floating on the same paper; the bottom runs off the card */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={phoneUri}
          alt=""
          width={440}
          height={820}
          style={{ position: "absolute", top: 76, right: 72 }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Delight", data: font("delight-600.ttf"), weight: 600 },
        { name: "Delight", data: font("delight-700.ttf"), weight: 700 },
        { name: "Delight", data: font("delight-800.ttf"), weight: 800 },
      ],
      // Unlike a profile card there's nothing here that changes with an
      // account, so the default long cache is what we want.
    },
  );
}
