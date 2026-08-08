import { readFileSync } from "fs";
import { join } from "path";
import type { StoryTheme } from "@/lib/format";
import { brandIcon } from "@/lib/brand";

// The square card, drawn once.
//
// A coach's public class and one of your own entries are the same picture with
// a different row behind them, and two copies of this would have drifted the
// first time one of them gained a style. The route decides what the words are
// and who may see it; this decides what it looks like.

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 }[] | null = null;
export function cardFonts() {
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

export type ClassCard = {
  /** The class photo, when there is one. It carries the card. */
  image: string | null;
  /** Behind the photo, and instead of it: the owner's colour. */
  fallback: string;
  theme: StoryTheme;
  /** "Wednesday, July 24 · 6:00pm", already formatted. Empty for a class that
   *  has stopped running. */
  when: string;
  name: string;
  /** Under the name: who, and where. Blanks are dropped. */
  meta: string[];
  /** The last line. Empty on a card with nothing to link to. */
  link: string;
};

export function classCard(c: ClassCard) {
  const ink = "#ffffff";
  const nameSize =
    c.name.length <= 14 ? 96 : c.name.length <= 22 ? 76 : c.name.length <= 32 ? 60 : 48;
  return (
    // The frame carries no padding: Satori lays an absolute child out against
    // the padding box, so a picture inset by 80px and still 1080 wide hangs
    // off the right edge. The padding lives on the content column inside.
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: c.image ? "#101010" : c.fallback,
        color: ink,
        fontFamily: "Delight",
        position: "relative",
      }}
    >
      {c.image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.image}
            alt=""
            width={1080}
            height={1080}
            style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
          />
          {/* The same two scrims a profile wears: enough at the top for the
              lockup, enough at the bottom for the words, and the middle of
              the photograph left alone. */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1080,
              height: 360,
              display: "flex",
              background: "linear-gradient(to bottom, rgba(0,0,0,.62), rgba(0,0,0,0))",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 480,
              left: 0,
              width: 1080,
              height: 600,
              display: "flex",
              background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.86))",
            }}
          />
        </>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 1080,
          height: 1080,
          padding: "72px 80px 80px",
          position: "relative",
        }}
      >
        {/* The mark at the top, alone: the Weekly/One off pill came off, by
            Matt's call. The card is an invitation, and which recurrence
            bucket the row lives in is bookkeeping nobody posts about. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconUri(ink)} alt="" width={44} height={45} />
          <span style={{ fontWeight: 800, fontSize: 40, letterSpacing: -1.5 }}>FittList</span>
        </div>

        {/* The class, at the bottom where the scrim is darkest. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 920 }}>
          {c.when && (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: 5,
                textTransform: "uppercase",
                // White over a photograph, by Matt's call: the accent read
                // fine on a flat colour and vanished into a busy picture.
                color: c.image ? "rgba(255,255,255,.92)" : c.theme.accent,
              }}
            >
              {c.when}
            </div>
          )}
          <div
            style={{
              display: "flex",
              fontSize: nameSize,
              fontWeight: 800,
              letterSpacing: -2,
              lineHeight: 1.02,
            }}
          >
            {c.name}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 36,
              fontWeight: 600,
              color: "rgba(255,255,255,.86)",
            }}
          >
            {c.meta.filter(Boolean).join("  ·  ")}
          </div>
          {c.link && (
            <div
              style={{
                display: "flex",
                marginTop: 14,
                fontSize: 34,
                fontWeight: 700,
                color: "rgba(255,255,255,.72)",
              }}
            >
              {c.link}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
