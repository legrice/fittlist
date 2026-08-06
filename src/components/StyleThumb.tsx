"use client";

import type { StoryStyle, StoryTheme } from "@/lib/format";

/**
 * A style, drawn small, with real words in it.
 *
 * The picker showed three coloured bars per style, which told somebody the
 * colours and nothing else: ten cards that differed only in hue, above a
 * question about arrangement. So this draws the arrangement, off the same
 * `StoryStyle` the image route reads: the day label with its tracking, a row
 * or two with the class name at its relative size, uppercase or not, centred
 * or left, ruled or boxed or bare, and the time in its own gutter or under
 * the name.
 *
 * It is a miniature rather than a real render on purpose. Ten Satori posters
 * at 1080x1920 to fill one sheet is ten image requests for a decision that
 * takes a second, and the preview above the sheet is already the real thing
 * the moment you pick. What this has to be is honest about the shape, which
 * means every knob here reads from the style rather than being drawn to look
 * about right.
 *
 * The one thing it cannot show is how a week's worth of rows collapses when
 * the poster runs out of room (`planStory`'s three tiers). Nothing at this
 * size could, and the preview shows it a tap later.
 */
export function StyleThumb({ style: y, theme: t }: { style: StoryStyle; theme: StoryTheme }) {
  const center = y.align === "center";
  // Everything is in em of the card's own font size, so one number scales the
  // whole miniature and the proportions survive whatever width the grid gives
  // it. The style's own multipliers ride on top, which is what makes Stack's
  // names visibly bigger than Bare's rather than nominally so.
  const rowStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: y.stackTime ? "column" : "row",
    alignItems: center ? "center" : "flex-start",
    gap: y.stackTime ? "0.1em" : "0.5em",
    marginBottom: "0.5em",
    ...(y.chip
      ? {
          background: `${t.faint}33`,
          // The real thing takes a pixel radius against a 1080 canvas; here it
          // is em, so a pill stays a pill and a boxed card stays a box.
          borderRadius: y.radius >= 999 ? "999px" : "0.5em",
          padding: "0.35em 0.6em",
        }
      : null),
    ...(y.rule !== "none" && !y.chip
      ? {
          borderBottom: `${y.rule === "bold" ? 2 : 1}px solid ${t.faint}88`,
          paddingBottom: "0.35em",
        }
      : null),
  };

  const row = (time: string, name: string, key: string) => (
    <div key={key} style={rowStyle}>
      {!y.stackTime && (
        <span style={{ color: t.time, fontWeight: 700, flexShrink: 0 }}>{time}</span>
      )}
      <span
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: center ? "center" : "flex-start",
          textAlign: y.align,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            lineHeight: 1.1,
            fontSize: `${y.name}em`,
            ...(y.upper ? { textTransform: "uppercase" as const } : null),
          }}
        >
          {name}
        </span>
        {y.stackTime && <span style={{ color: t.time, fontWeight: 700 }}>{time}</span>}
      </span>
    </div>
  );

  return (
    <span
      className="stylethumb"
      style={{ background: t.bg, color: t.fg, alignItems: center ? "center" : "stretch" }}
      aria-hidden="true"
    >
      {/* The headline, as a block rather than words: at this size the real
          words would be two illegible lines, and what the style changes about
          it is only how much room it takes. */}
      <span
        className="stylethumb-h"
        style={{ background: t.accent, height: `${0.42 * y.headline}em`, alignSelf: center ? "center" : "flex-start" }}
      />
      <span
        className="stylethumb-day"
        style={{
          color: t.faint,
          letterSpacing: `${y.dayTrack}em`,
          alignSelf: center ? "center" : "flex-start",
        }}
      >
        Mon
      </span>
      {row("6a", "Barbell", "a")}
      {row("6p", "Flow", "b")}
    </span>
  );
}
