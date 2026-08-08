import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand";
import type { StoryStyle, StoryTheme } from "@/lib/format";
import { storyPadding, type StoryFormat, type StoryPlan } from "@/lib/storyplan";

// One paint for every share image.
//
// There were two copies of this tree, the coach's poster and the member's, and
// they had already drifted: a fix to one was a fix to neither until somebody
// noticed. The composer would have made three. What differs between them is
// which rows they load and what the footer says, which is data, so the data is
// the argument and the paint is shared.
//
// Satori can't measure, so every height here has a constant beside it in
// `storyplan.ts` and `npm run check:story` holds the two together. Change a
// font size or a margin here and change its constant in the same commit.

const font = (file: string) => readFileSync(join(process.cwd(), "public/fonts", file));

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 }[] | null = null;
/** The brand typeface across the whole image. Satori needs static TTFs (no
 *  woff2, no variable axes), hence the .ttf copies in public/fonts. */
export function loadStoryFonts() {
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

/** The picked Type's own file, cached per path the way the base four are:
 *  the poster only ever carries Delight plus at most one guest face. */
const extraFonts = new Map<string, Buffer>();
function loadTypeFace(family: string, file: string, style: "normal" | "italic" = "normal") {
  let data = extraFonts.get(file);
  if (!data) {
    data = font(file);
    extraFonts.set(file, data);
  }
  return { name: family, data, weight: 400 as const, style };
}

/** The block mark as a base64 SVG. It is recoloured only when it would vanish
 *  against the theme's own background. */
export function iconUri(color: string) {
  return `data:image/svg+xml;base64,${Buffer.from(brandIcon(color)).toString("base64")}`;
}

export type StoryModel = {
  theme: StoryTheme;
  /** How it is drawn, as opposed to what colour it is. Two axes, because
   *  eight palettes times ten styles is eighty posters from two small rows of
   *  controls, where one merged picker would be eighty swatches to scan. */
  style: StoryStyle;
  format: StoryFormat;
  /** Split in two for the line break; one colour. The second may be empty. */
  line1: string;
  line2: string;
  headlineSize: number;
  /** Said once under the headline rather than on every row. */
  city: string;
  /** A data URL, or null for no face. */
  photo: string | null;
  plan: StoryPlan;
  /** Nothing in range: the picture still has to be worth looking at. */
  empty: boolean;
  emptyLine: string;
  /** The small line above the URL: "Full schedule at", "Join me". */
  verb: string;
  url: string;
  /** The headline's Font, and only the headline's, by Matt's call: the
   *  body is Delight, always. Null or Delight means no guest font. */
  typeface?: { family: string; file: string | null; italic?: boolean } | null;
};

export function renderStory(model: StoryModel) {
  const {
    theme: t,
    style: y,
    format,
    line1,
    line2,
    headlineSize: hSize,
    city,
    photo,
    plan,
    empty,
    emptyLine,
    verb,
    url,
    typeface,
  } = model;
  const guest = typeface?.file ? typeface : null;
  const markUri = iconUri(t.lockupAccent ?? t.accent);
  const pad = storyPadding(format);
  const square = format === "square";
  // A square is a little over half the height, so the furniture comes down
  // with it or there is no room left for the week itself.
  const s = square ? 0.82 : 1;
  const px = (n: number) => Math.round(n * s);

  const base =
    plan.tier === 1
      ? { dayFs: 34, dayMt: 34, dayMb: 17, timeFs: 43, timeW: 172, gap: 34, nameFs: 48, subFs: 41, rowMb: 22, colW: 702 }
      : { dayFs: 30, dayMt: 26, dayMb: 13, timeFs: 38, timeW: 150, gap: 30, nameFs: 42, subFs: 36, rowMb: 18, colW: 728 };
  // The style scales the row, and the route has already divided the planner's
  // budget by `rowScale` so the taller ones still fit. Stacking the time frees
  // its column, so the name gets that width back.
  const m = {
    ...base,
    nameFs: Math.round(base.nameFs * y.name),
    subFs: Math.round(base.subFs * y.name),
    colW: y.stackTime ? base.colW + base.timeW + base.gap : base.colW,
  };

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
          padding: `${pad.top}px ${pad.side}px ${pad.bottom}px`,
          fontFamily: "Delight",
        }}
      >
        {/* No eyebrow up here any more, by Matt's call: the accent bar
            went first, then the range kicker, because each day heading
            carries its own date now and a range over dated headings said
            everything twice. The headline opens the poster. */}
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          // 216, up from 172 by Matt's call: the face is most of why a
          // poster reads as somebody's. The headline's maxWidth below
          // yields the difference, and the rows never reach this corner
          // (the header block the budget reserves is taller than the
          // photo at its smallest).
          <img
            src={photo}
            alt=""
            width={px(216)}
            height={px(216)}
            style={{
              position: "absolute",
              top: pad.top - 8,
              right: pad.side,
              borderRadius: 999,
              objectFit: "cover",
              borderWidth: 8,
              borderStyle: "solid",
              borderColor: t.accent,
            }}
          />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontWeight: 800,
            fontSize: hSize,
            lineHeight: 0.98,
            // Delight's own tight tracking; a guest face keeps its natural
            // fit, because -3 was tuned to one font and crushes a serif.
            // No case transform any more, by Matt's call: the headline
            // renders as typed, sentence case by default, and ALL CAPS is
            // the writer's own key to press.
            letterSpacing: guest ? 0 : -3,
            // The one place the picked Font speaks, by Matt's call: the
            // whole-poster version shipped for a day, and the body went
            // back to Delight.
            fontFamily: guest ? `'${guest.family}', 'Delight'` : "Delight",
            fontStyle: guest?.italic ? "italic" : "normal",
            marginBottom: px(78),
            maxWidth: photo ? 646 : 908,
          }}
        >
          <span>{line1}</span>
          {/* One colour for both lines, by Matt's call: the accent second
              line was a house style tic, and the headline reads as one
              sentence now that the case is the writer's own. */}
          {line2 && <span>{line2}</span>}
        </div>

        {city && (
          <div
            style={{
              display: "flex",
              fontSize: px(38),
              color: t.faint,
              marginTop: px(-58),
              marginBottom: px(34),
            }}
          >
            {city}
          </div>
        )}

        {plan.lifted && (
          <div style={{ display: "flex", fontSize: px(36), color: t.faint, marginBottom: px(30) }}>
            {plan.lifted}
          </div>
        )}

        {empty ? (
          <div style={{ display: "flex", color: t.faint, fontSize: px(44) }}>{emptyLine}</div>
        ) : plan.tier === 3 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {plan.summary.map(({ day, entries }) => (
              <div key={day} style={{ display: "flex", marginBottom: 26 }}>
                <span
                  style={{
                    display: "flex",
                    width: 118,
                    flexShrink: 0,
                    paddingTop: Math.max(2, Math.round((plan.summaryFs * 1.3 - 36) / 2)),
                    fontWeight: 600,
                    fontSize: 30,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: t.faint,
                  }}
                >
                  {day}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 764,
                    fontSize: plan.summaryFs,
                    lineHeight: 1.3,
                  }}
                >
                  {entries.map((e) => (
                    <div key={e.name} style={{ display: "flex" }}>
                      <span style={{ fontWeight: 700 }}>{e.name}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: t.muted,
                          marginLeft: Math.round(plan.summaryFs * 0.32),
                        }}
                      >
                        {e.times}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {plan.moreDays > 0 && (
              <div style={{ display: "flex", fontSize: 34, color: t.faint, marginTop: 12 }}>
                + {plan.moreDays} more {plan.moreDays === 1 ? "day" : "days"} at {url}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {plan.days.map(({ day, rows }) => (
              <div key={day} style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    fontWeight: 600,
                    fontSize: m.dayFs,
                    letterSpacing: `${y.dayTrack}em`,
                    textTransform: "uppercase",
                    color: t.faint,
                    alignSelf: y.align === "center" ? "center" : "flex-start",
                    margin: `${m.dayMt}px 0 ${m.dayMb}px`,
                  }}
                >
                  {day}
                </div>
                {rows.map((r, i) => (
                  <div
                    key={`${day}-${i}`}
                    style={{
                      display: "flex",
                      // Stacked, the time drops under the name and the row
                      // becomes a column; otherwise it holds its own gutter.
                      flexDirection: y.stackTime ? "column" : "row",
                      alignItems: y.align === "center" ? "center" : "flex-start",
                      gap: y.stackTime ? 4 : m.gap,
                      marginBottom: m.rowMb,
                      ...(y.chip
                        ? {
                            background: t.faint + "22",
                            borderRadius: y.radius,
                            padding: `${Math.round(m.rowMb * 0.7)}px ${Math.round(m.gap * 0.7)}px`,
                          }
                        : null),
                      ...(y.rule !== "none" && !y.chip
                        ? {
                            borderBottom: `${y.rule === "bold" ? 4 : 2}px solid ${t.faint}55`,
                            paddingBottom: Math.round(m.rowMb * 0.6),
                          }
                        : null),
                    }}
                  >
                    {!y.stackTime && (
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: m.timeFs,
                          color: t.time,
                          width: m.timeW,
                          flexShrink: 0,
                          display: "flex",
                        }}
                      >
                        {r.time}
                      </span>
                    )}
                    {/* Bounded, so a long class name wraps instead of running
                        off the right edge. Satori won't wrap a flex child
                        that has no width to wrap inside. */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        width: m.colW,
                        alignItems: y.align === "center" ? "center" : "flex-start",
                      }}
                    >
                      <span
                        style={{
                          fontSize: m.nameFs,
                          fontWeight: 700,
                          lineHeight: 1.15,
                          textAlign: y.align,
                          ...(y.upper ? { textTransform: "uppercase" as const } : null),
                        }}
                      >
                        {r.name}
                      </span>
                      {y.stackTime && (
                        <span style={{ fontSize: m.timeFs, fontWeight: 700, color: t.time }}>
                          {r.time}
                        </span>
                      )}
                      {r.sub && (
                        <span
                          style={{
                            fontSize: m.subFs,
                            color: t.faint,
                            lineHeight: 1.2,
                            textAlign: y.align,
                          }}
                        >
                          {r.sub}
                        </span>
                      )}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: px(30), color: t.faint, letterSpacing: 1 }}>
              {verb}
            </span>
            <span style={{ fontWeight: 600, fontSize: px(40) }}>{url}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={px(56)} height={px(57)} />
            <span
              style={{
                // The lockup is the logo, and a logo does not change fonts
                // with the poster's voice.
                fontFamily: "Delight",
                fontWeight: 800,
                fontSize: px(50),
                color: t.fg,
                letterSpacing: -2,
              }}
            >
              FittList
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: square ? 1080 : 1920,
      fonts: guest
        ? [...loadStoryFonts(), loadTypeFace(guest.family, guest.file!, guest.italic ? "italic" : "normal")]
        : loadStoryFonts(),
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/**
 * The headline, split across two lines with the second in the accent.
 *
 * Scaled to its own longest line rather than set once, because "My week" and
 * "Come train with me at Ironbound" are the same control and the second one
 * ran off the edge at the first one's size.
 */
export function headlineOf(text: string, fallback: [string, string]) {
  let line1 = fallback[0];
  let line2 = fallback[1];
  const clean = text.trim();
  if (clean) {
    const words = clean.split(/\s+/);
    const cut = Math.ceil(words.length / 2);
    line1 = words.slice(0, cut).join(" ");
    line2 = words.slice(cut).join(" ");
  }
  const longest = Math.max(line1.length, line2.length);
  const size = longest <= 9 ? 104 : longest <= 13 ? 86 : longest <= 18 ? 70 : 58;
  return { line1, line2, size };
}
