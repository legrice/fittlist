import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { brandIcon } from "@/lib/brand";
import type { StoryStyle, StoryTheme } from "@/lib/format";
import { storyPadding, type StoryFormat, type StoryPlan } from "@/lib/storyplan";
import type { DecoId } from "@/lib/decorations";

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
  /** How it is drawn, as opposed to what colour it is. Layout and palette
   *  stay separate so either choice remains small enough to understand. */
  style: StoryStyle;
  format: StoryFormat;
  /** Split in two for the line break; one colour. The second may be empty. */
  line1: string;
  line2: string;
  headlineSize: number;
  /** A data URL, or null for no face. */
  photo: string | null;
  plan: StoryPlan;
  /** Nothing in range: the picture still has to be worth looking at. */
  empty: boolean;
  emptyLine: string;
  /** The page's own address, in the footer under "See my schedule at":
   *  the URL is the thing the poster exists to hand on. It rode under the
   *  headline for a build and went back down, by Matt's call. */
  url: string;
  /** The headline's Font, and only the headline's, by Matt's call: the
   *  body is Delight, always. Null or Delight means no guest font. */
  typeface?: { family: string; file: string | null; italic?: boolean; track?: number } | null;
  /** The dressing: a frame, day dividers, both, or nothing. */
  deco?: DecoId;
};

export function renderStory(model: StoryModel) {
  const {
    theme: t,
    style: y,
    format,
    line1,
    line2,
    headlineSize: hSize,
    photo,
    plan,
    empty,
    emptyLine,
    url,
    typeface,
    // On by default, by Matt's call: the thick brand stripe is back on
    // every share image, and Clean is the pick that takes it off.
    deco = "top",
  } = model;
  const framed = deco === "frame" || deco === "framed";
  const divided = deco === "dividers" || deco === "framed";
  const guest = typeface?.file ? typeface : null;
  const markUri = iconUri(t.lockupAccent ?? t.accent);
  const pad = storyPadding(format);
  const square = format === "square";
  const layout = y.layout;
  const editorialInk = layout === "swiss" || layout === "cowboy";
  // A square is a little over half the height, so the furniture comes down
  // with it or there is no room left for the week itself.
  const s = square ? 0.82 : 1;
  const px = (n: number) => Math.round(n * s);

  // Names at 50/44, up two by Matt's call, and they truncate to one line
  // now instead of wrapping: T1/T2 in storyplan.ts carry the two pixels.
  const base =
    plan.tier === 1
      ? { dayFs: 34, dayMt: 34, dayMb: 17, timeFs: 43, timeW: 172, gap: 34, nameFs: 50, subFs: 41, rowMb: 22, colW: 702 }
      : { dayFs: 30, dayMt: 26, dayMb: 13, timeFs: 38, timeW: 150, gap: 30, nameFs: 44, subFs: 36, rowMb: 18, colW: 728 };
  // The style scales the row, and the route has already divided the planner's
  // budget by `rowScale` so the taller ones still fit. Stacking the time frees
  // its column, so the name gets that width back.
  const m = {
    ...base,
    nameFs: Math.round(base.nameFs * y.name),
    subFs: Math.round(base.subFs * y.name),
    colW: y.stackTime ? base.colW + base.timeW + base.gap : base.colW,
  };
  // Every experimental row still occupies the same 908px content measure.
  // Insets and gaps come out of the detail column instead of pushing the
  // right edge off-canvas.
  const rowPadX =
    layout === "party" ? 22 : layout === "split" || layout === "neon" || layout === "brutalist" ? 18 : 0;
  const rowGap =
    layout === "party" ? 24 : layout === "neon" ? 20 : layout === "brutalist" ? 22 : layout === "split" ? 18 : m.gap;
  const timeW = layout === "brutalist" ? 150 : m.timeW;
  const detailW = y.stackTime ? 908 - rowPadX * 2 : 908 - rowPadX * 2 - timeW - rowGap;
  const editorialDays =
    plan.tier === 3
      ? plan.summary.map(({ day, entries }) => ({
          day,
          rows: entries.map((entry) => ({ time: entry.times, name: entry.name, sub: "" })),
        }))
      : plan.days;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: t.bg,
          color: editorialInk ? t.accent : t.fg,
          padding: `${pad.top}px ${pad.side}px ${pad.bottom}px`,
          fontFamily: "Delight",
        }}
      >
        {/* The original thick brand stripe, back as a Decoration and the
            default one. Not content, so it bleeds to the very edge and
            costs the rows nothing. */}
        {deco === "top" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              // Both canvases are 1080 wide. Not "100%": satori resolves
              // that against the content box and the bar stops 172px short.
              width: 1080,
              height: 26,
              background: t.accent,
              display: "flex",
            }}
          />
        )}
        {/* The frames: absolute layers inside the canvas padding, so they
            never touch the text. The photo sits at the padding line too,
            inside the frame's inset. */}
        {framed && (
          <div
            style={{
              position: "absolute",
              top: px(40),
              left: px(40),
              right: px(40),
              bottom: px(40),
              display: "flex",
              borderWidth: 3,
              borderStyle: "solid",
              borderColor: t.fg,
              borderRadius: 8,
            }}
          />
        )}
        {/* Two sibling conditionals, not one fragment: satori flattens a
            fragment's absolute children into the flow and drew the double
            frame as a strikethrough. */}
        {deco === "double" && (
          <div
            style={{
              position: "absolute",
              top: px(36),
              left: px(36),
              right: px(36),
              bottom: px(36),
              display: "flex",
              borderWidth: 3,
              borderStyle: "solid",
              borderColor: t.fg,
              borderRadius: 10,
            }}
          />
        )}
        {deco === "double" && (
          <div
            style={{
              position: "absolute",
              top: px(52),
              left: px(52),
              right: px(52),
              bottom: px(52),
              display: "flex",
              borderWidth: 2,
              borderStyle: "solid",
              borderColor: t.faint,
              borderRadius: 6,
            }}
          />
        )}
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
        {/* No headline at all is a real choice now (the sheet's switch), and
            the block goes entirely rather than drawing empty at height: the
            rows take the room. The face still needs clearing when it is on,
            since it is absolute and the flow would run under it; the spacer
            stays under the 246 the route budgets. */}
        {!line1 && !line2 && photo && (
          <div style={{ display: "flex", height: px(216) + 22 }} />
        )}
        {(line1 || line2) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontWeight: 800,
            fontSize: hSize,
            lineHeight: 0.98,
            // Delight's own tight tracking; a guest face keeps its natural
            // fit, because -3 was tuned to one font and crushes a serif.
            // Unless the face names its own track (Lora's italic sits
            // loose, so Elder millennial pulls in 2%).
            // No case transform any more, by Matt's call: the headline
            // renders as typed, sentence case by default, and ALL CAPS is
            // the writer's own key to press.
            letterSpacing: guest ? Math.round((guest.track ?? 0) * hSize) : -3,
            // The one place the picked Font speaks, by Matt's call: the
            // whole-poster version shipped for a day, and the body went
            // back to Delight.
            fontFamily: guest ? `'${guest.family}', 'Delight'` : "Delight",
            fontStyle: guest?.italic ? "italic" : "normal",
            textTransform: y.upper ? "uppercase" : "none",
            color: layout === "neon" || editorialInk ? t.accent : t.fg,
            marginBottom: px(78),
            maxWidth: photo ? 646 : 908,
            ...(layout === "split"
              ? { borderBottomWidth: 5, borderBottomStyle: "solid", borderBottomColor: t.fg, paddingBottom: 18 }
              : {}),
            ...(layout === "brutalist"
              ? { borderBottomWidth: 9, borderBottomStyle: "solid", borderBottomColor: t.fg, paddingBottom: 12 }
              : {}),
            ...(layout === "swiss"
              ? {
                  maxWidth: photo ? 646 : 908,
                  borderBottomWidth: 3,
                  borderBottomStyle: "solid",
                  borderBottomColor: t.accent,
                  paddingBottom: 18,
                  marginBottom: px(54),
                }
              : {}),
            ...(layout === "cowboy"
              ? {
                  maxWidth: photo ? 646 : 908,
                  borderBottomWidth: 8,
                  borderBottomStyle: "solid",
                  borderBottomColor: t.accent,
                  paddingBottom: 8,
                  marginBottom: px(42),
                  lineHeight: 0.84,
                  letterSpacing: guest ? Math.round((guest.track ?? -0.03) * hSize) : -5,
                }
              : {}),
          }}
        >
          <span>{line1}</span>
          {line2 && (
            <span style={{ color: layout === "party" || layout === "brutalist" ? t.accent : undefined }}>
              {line2}
            </span>
          )}
        </div>
        )}

        {/* No line under the headline any more: the URL rode here for a
            build and went back to the footer, by Matt's call, under "See
            my schedule at". The headline opens straight onto the week. */}

        {plan.lifted && (
          <div style={{ display: "flex", fontSize: px(36), color: t.faint, marginBottom: px(30) }}>
            {plan.lifted}
          </div>
        )}

        {empty ? (
          <div style={{ display: "flex", color: t.faint, fontSize: px(44) }}>{emptyLine}</div>
        ) : layout === "swiss" ? (
          <div style={{ display: "flex", flexWrap: "wrap", width: 908 }}>
            {editorialDays.map(({ day, rows }, di) => (
              <div
                key={day}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: 302,
                  minHeight: px(250),
                  padding: `0 ${di % 3 === 2 ? 0 : 18}px ${px(26)}px ${di % 3 === 0 ? 0 : 18}px`,
                  marginBottom: px(34),
                  borderLeftWidth: di % 3 === 0 ? 0 : 3,
                  borderLeftStyle: "solid",
                  borderLeftColor: t.accent,
                }}
              >
                <span
                  style={{
                    display: "flex",
                    fontSize: px(28),
                    fontWeight: 600,
                    lineHeight: 1,
                    marginBottom: px(24),
                  }}
                >
                  {day}
                </span>
                {rows.length === 0 ? (
                  <span style={{ display: "flex", fontSize: px(28), color: t.faint }}>Open</span>
                ) : (
                  rows.map((row, ri) => (
                    <div
                      key={`${day}-${ri}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        paddingTop: ri === 0 ? 0 : px(18),
                        marginTop: ri === 0 ? 0 : px(18),
                        borderTopWidth: ri === 0 ? 0 : 2,
                        borderTopStyle: "solid",
                        borderTopColor: t.accent,
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          width: "100%",
                          fontSize: px(52),
                          fontWeight: 700,
                          lineHeight: 0.96,
                          letterSpacing: -1,
                        }}
                      >
                        {row.name}
                      </span>
                      {row.sub && (
                        <span style={{ display: "flex", fontSize: px(29), lineHeight: 1.1, marginTop: px(10) }}>
                          {row.sub}
                        </span>
                      )}
                      <span
                        style={{
                          display: "flex",
                          fontSize: px(31),
                          fontWeight: 600,
                          lineHeight: 1.1,
                          marginTop: px(7),
                        }}
                      >
                        {row.time}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ))}
            {plan.moreDays > 0 && (
              <div style={{ display: "flex", width: 908, fontSize: px(28), borderTop: `3px solid ${t.accent}`, paddingTop: px(16) }}>
                + {plan.moreDays} more {plan.moreDays === 1 ? "day" : "days"} at {url}
              </div>
            )}
          </div>
        ) : layout === "cowboy" ? (
          <div style={{ display: "flex", flexWrap: "wrap", width: 908 }}>
            {editorialDays.map(({ day, rows }, di) => {
              const full = di % 3 === 2;
              const right = di % 2 === 1;
              const width = full ? 908 : 454;
              return (
                <div
                  key={day}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width,
                    minHeight: full ? px(180) : px(208),
                    padding: `0 ${right ? 0 : 30}px ${px(20)}px ${right ? 30 : 0}px`,
                    marginBottom: px(24),
                    borderBottomWidth: 4,
                    borderBottomStyle: "solid",
                    borderBottomColor: t.accent,
                    alignItems: right ? "flex-end" : "flex-start",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      width: "100%",
                      justifyContent: right ? "flex-end" : "flex-start",
                      textAlign: right ? "right" : "left",
                      fontSize: px(full ? 68 : 40),
                      fontWeight: 800,
                      lineHeight: 0.86,
                      letterSpacing: -2,
                      textTransform: "uppercase",
                      marginBottom: px(15),
                    }}
                  >
                    {day.split(",")[0]}
                  </span>
                  {rows.map((row, ri) => (
                    <div
                      key={`${day}-${ri}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: right ? "flex-end" : "flex-start",
                        width: "100%",
                        marginTop: ri === 0 ? 0 : px(12),
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: right ? "right" : "left",
                          fontSize: px(31),
                          fontWeight: 800,
                          lineHeight: 0.98,
                          textTransform: "uppercase",
                        }}
                      >
                        {row.name}
                      </span>
                      <span
                        style={{
                          display: "flex",
                          fontSize: px(23),
                          fontWeight: 600,
                          lineHeight: 1.05,
                          marginTop: px(5),
                        }}
                      >
                        {[row.time, row.sub].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {plan.moreDays > 0 && (
              <div style={{ display: "flex", width: 908, fontSize: px(28), textTransform: "uppercase" }}>
                + {plan.moreDays} more {plan.moreDays === 1 ? "day" : "days"} at {url}
              </div>
            )}
          </div>
        ) : plan.tier === 3 ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {plan.summary.map(({ day, entries }) => (
              <div
                key={day}
                style={{
                  display: "flex",
                  flexDirection: layout === "plain" ? "row" : "column",
                  marginBottom: layout === "brutalist" ? 36 : 26,
                  ...(layout === "split"
                    ? { borderWidth: 2, borderStyle: "solid", borderColor: t.fg, borderRadius: 12, padding: 16 }
                    : {}),
                  ...(layout === "party"
                    ? { borderWidth: 3, borderStyle: "solid", borderColor: t.fg, borderRadius: 24, padding: 16 }
                    : {}),
                  ...(layout === "neon"
                    ? { borderWidth: 3, borderStyle: "solid", borderColor: t.accent, borderRadius: 12, padding: 16 }
                    : {}),
                  ...(layout === "brutalist"
                    ? {
                        borderWidth: 5,
                        borderStyle: "solid",
                        borderColor: t.fg,
                        padding: 16,
                        boxShadow: `9px 9px 0 ${t.accent}`,
                      }
                    : {}),
                }}
              >
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
                    color: layout === "neon" ? t.accent : t.faint,
                    ...(layout !== "plain"
                      ? {
                          width: "100%",
                          paddingTop: 0,
                          marginBottom: 10,
                          color: layout === "neon" ? t.accent : t.fg,
                        }
                      : {}),
                  }}
                >
                  {day}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: layout === "plain" ? 764 : 840,
                    fontSize: layout === "plain" ? plan.summaryFs : Math.min(plan.summaryFs, 38),
                    lineHeight: 1.3,
                  }}
                >
                  {entries.map((e) => (
                    <div key={e.name} style={{ display: "flex", width: "100%" }}>
                      <span
                        style={{
                          display: layout === "plain" ? "flex" : "block",
                          width: layout === "plain" ? "auto" : 650,
                          lineClamp: layout === "plain" ? undefined : 1,
                          fontWeight: 700,
                          ...(y.upper ? { textTransform: "uppercase" as const } : {}),
                          ...(layout === "neon" ? { color: t.accent } : {}),
                        }}
                      >
                        {e.name}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: layout === "neon" ? t.accent : t.muted,
                          marginLeft: Math.round(plan.summaryFs * 0.32),
                          ...(layout !== "plain"
                            ? { width: 150, marginLeft: 20, justifyContent: "flex-end" }
                            : {}),
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
            {plan.days.map(({ day, rows }, di) => (
              // The divider rides the gap the day heading already keeps
              // (its own top margin), so it costs two pixels a day, which
              // the bottom padding's slack absorbs.
              <div
                key={day}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  ...(divided && di > 0
                    ? { borderTopWidth: 2, borderTopStyle: "solid", borderTopColor: `${t.faint}66` }
                    : {}),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontWeight: 600,
                    fontSize: layout === "brutalist" ? m.dayFs + 4 : m.dayFs,
                    letterSpacing: `${y.dayTrack}em`,
                    textTransform: "uppercase",
                    color: layout === "neon" ? t.accent : t.faint,
                    alignSelf: y.align === "center" ? "center" : "flex-start",
                    margin: `${m.dayMt}px 0 ${m.dayMb}px`,
                    ...(layout === "split"
                      ? {
                          padding: "8px 13px",
                          borderWidth: 2,
                          borderStyle: "solid",
                          borderColor: t.fg,
                          borderRadius: 8,
                          color: t.fg,
                        }
                      : {}),
                    ...(layout === "party"
                      ? {
                          padding: "8px 17px",
                          borderWidth: 3,
                          borderStyle: "solid",
                          borderColor: t.accent,
                          borderRadius: 999,
                          color: t.fg,
                        }
                      : {}),
                    ...(layout === "neon"
                      ? {
                          paddingLeft: 14,
                          borderLeftWidth: 8,
                          borderLeftStyle: "solid",
                          borderLeftColor: t.accent,
                        }
                      : {}),
                    ...(layout === "brutalist"
                      ? {
                          paddingBottom: 5,
                          borderBottomWidth: 6,
                          borderBottomStyle: "solid",
                          borderBottomColor: t.fg,
                          color: t.fg,
                        }
                      : {}),
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
                      gap: y.stackTime ? 4 : rowGap,
                      marginBottom: layout === "brutalist" ? m.rowMb + 10 : m.rowMb,
                      ...(layout === "plain" && y.chip
                        ? {
                            background: t.faint + "22",
                            borderRadius: y.radius,
                            padding: `${Math.round(m.rowMb * 0.7)}px ${Math.round(m.gap * 0.7)}px`,
                          }
                        : null),
                      ...(layout === "plain" && y.rule !== "none" && !y.chip
                        ? {
                            borderBottom: `${y.rule === "bold" ? 4 : 2}px solid ${t.faint}55`,
                            paddingBottom: Math.round(m.rowMb * 0.6),
                          }
                        : null),
                      ...(layout === "split"
                        ? {
                            padding: `18px ${rowPadX}px`,
                            borderWidth: 2,
                            borderStyle: "solid",
                            borderColor: t.fg,
                            borderRadius: y.radius,
                          }
                        : {}),
                      ...(layout === "party"
                        ? {
                            padding: `18px ${rowPadX}px`,
                            borderWidth: 3,
                            borderStyle: "solid",
                            borderColor: t.fg,
                            borderRadius: y.radius,
                            background: `${i % 2 === 0 ? t.accent : t.fg}14`,
                          }
                        : {}),
                      ...(layout === "neon"
                        ? {
                            padding: `16px ${rowPadX}px`,
                            borderWidth: 3,
                            borderStyle: "solid",
                            borderColor: t.accent,
                            borderRadius: y.radius,
                            background: `${t.accent}0d`,
                          }
                        : {}),
                      ...(layout === "brutalist"
                        ? {
                            padding: `17px ${rowPadX}px`,
                            borderWidth: 5,
                            borderStyle: "solid",
                            borderColor: t.fg,
                            borderRadius: 0,
                            boxShadow: `10px 10px 0 ${t.accent}`,
                          }
                        : {}),
                    }}
                  >
                    {!y.stackTime && (
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: m.timeFs,
                          color: layout === "neon" ? t.accent : t.time,
                          width: timeW,
                          flexShrink: 0,
                          display: "flex",
                          ...(layout === "split"
                            ? {
                                alignSelf: "stretch",
                                alignItems: "center",
                                borderRightWidth: 2,
                                borderRightStyle: "solid",
                                borderRightColor: t.fg,
                              }
                            : {}),
                        }}
                      >
                        {r.time}
                      </span>
                    )}
                    {/* Bounded so the name has an edge to stop at, and it
                        stops rather than wraps now, by Matt's call: one line
                        with an ellipsis, because a name that broke onto a
                        second line made one row twice the height the sums
                        counted. lineClamp needs display block in satori. */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        width: detailW,
                        alignItems: y.align === "center" ? "center" : "flex-start",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          lineClamp: 1,
                          width: "100%",
                          fontSize: m.nameFs,
                          fontWeight: 700,
                          lineHeight: 1.15,
                          textAlign: y.align,
                          ...(y.upper ? { textTransform: "uppercase" as const } : null),
                          ...(layout === "neon" ? { color: t.accent } : null),
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
                            color: layout === "neon" ? t.accent : t.faint,
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
            ...(layout === "neon"
              ? { borderTopWidth: 3, borderTopStyle: "solid", borderTopColor: t.accent, paddingTop: 18 }
              : {}),
            ...(layout === "brutalist"
              ? { borderTopWidth: 7, borderTopStyle: "solid", borderTopColor: t.fg, paddingTop: 18 }
              : {}),
            ...(layout === "swiss"
              ? { borderTopWidth: 3, borderTopStyle: "solid", borderTopColor: t.accent, paddingTop: 18 }
              : {}),
            ...(layout === "cowboy"
              ? { borderTopWidth: 5, borderTopStyle: "solid", borderTopColor: t.accent, paddingTop: 16 }
              : {}),
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: px(30), color: t.faint, letterSpacing: 1 }}>
              See my schedule at
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
                color: editorialInk ? t.accent : t.fg,
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
