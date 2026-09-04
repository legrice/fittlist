"use client";

import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  STORY_STYLES,
  STORY_THEMES,
  type StoryStyle,
  type StoryStyleId,
  type StoryTheme,
  type StoryThemeId,
} from "@/lib/format";
import type { ShareStoryLayout } from "@/lib/share-story-layout";
import { TYPEFACES, type TypeFace, type TypeFaceId } from "@/lib/typefaces";
import type { DecoId } from "@/lib/decorations";
import {
  SHARE_HEADLINE_EDGE_PEEK,
  SHARE_HEADLINE_Y_MAX,
  SHARE_HEADLINE_Y_MIN,
  SHARE_SCHEDULE_EDGE_PEEK,
  SHARE_SCHEDULE_Y_MAX,
  SHARE_SCHEDULE_Y_MIN,
} from "@/lib/share-design";

const WIDTH = 1080;
const HEIGHT = 1920;

export type ShareLivePreviewProps = {
  layout: ShareStoryLayout;
  themeId: StoryThemeId;
  styleId: StoryStyleId;
  typeId: TypeFaceId;
  decoId: DecoId;
  backgroundPhotoUrl?: string | null;
  backgroundX?: number;
  backgroundY?: number;
  backgroundZoom?: number;
  backgroundOverlay?: number;
  photoPanels?: boolean;
  headlineY?: number;
  scheduleY?: number;
  handle: string;
  /** A stable identity for the exact configuration currently on screen. */
  configKey: string;
  emptyLine?: string;
  onRendered?: (configKey: string) => void;
  onBackgroundChange?: (next: { x: number; y: number; zoom: number }) => void;
  onHeadlineYChange?: (next: number) => void;
  onScheduleYChange?: (next: number) => void;
  onDirectEditStart?: (kind: "background" | "headline" | "classes") => void;
  onHeadlineTap?: () => void;
  onScheduleTap?: () => void;
};

type PreviewDay = {
  day: string;
  rows: Array<{ time: string; name: string; sub: string }>;
};

function clamped(value: number | undefined, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
}

function previewDays(layout: ShareStoryLayout): PreviewDay[] {
  if (layout.plan.tier !== 3) return layout.plan.days;
  return layout.plan.summary.map(({ day, entries }) => ({
    day,
    rows: entries.map((entry) => ({ time: entry.times, name: entry.name, sub: "" })),
  }));
}

function BrandMark({ color }: { color: string }) {
  return (
    <svg
      className="shbrand-mark"
      aria-hidden="true"
      viewBox="0 0 108 103"
      width="54"
      height="52"
      fill={color}
    >
      <rect width="108" height="27" rx="4" />
      <rect y="38" width="72" height="27" rx="4" />
      <rect y="76" width="36" height="27" rx="4" />
    </svg>
  );
}

function FeatureCard({
  layout,
  theme,
  onPhoto,
  panels,
}: {
  layout: ShareStoryLayout;
  theme: StoryTheme;
  onPhoto: boolean;
  panels: boolean;
}) {
  const feature = layout.feature;
  if (!feature) return null;
  return (
    <div
      style={{
        flex: "0 0 auto",
        marginBottom: 30,
        padding: "24px 28px",
        border: onPhoto && !panels ? "4px solid transparent" : `4px solid ${theme.accent}`,
        borderRadius: onPhoto && !panels ? 0 : 20,
        background: onPhoto ? (panels ? theme.bg : "transparent") : `${theme.accent}14`,
        color: onPhoto && !panels ? "#fff" : theme.fg,
        textShadow: onPhoto && !panels ? "0 3px 18px rgba(0,0,0,.92)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
          color: theme.accent,
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        <span>Featured</span>
        <span style={{ color: theme.time }}>{feature.day} · {feature.time}</span>
      </div>
      <div
        style={{
          overflow: "hidden",
          fontSize: 55,
          fontWeight: 800,
          lineHeight: 1.02,
          letterSpacing: -1,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {feature.name}
      </div>
      {feature.sub && (
        <div
          style={{
            overflow: "hidden",
            marginTop: 10,
            color: onPhoto && !panels ? "rgba(255,255,255,.86)" : theme.faint,
            fontSize: 29,
            fontWeight: 600,
            lineHeight: 1.1,
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {feature.sub}
        </div>
      )}
    </div>
  );
}

function PhotoSchedule({
  days,
  theme,
  compact,
  panels,
}: {
  days: PreviewDay[];
  theme: StoryTheme;
  compact: boolean;
  panels: boolean;
}) {
  const photoTextShadow = panels ? undefined : "0 3px 18px rgba(0,0,0,.92), 0 1px 3px rgba(0,0,0,1)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 22 : 30 }}>
      {days.map(({ day, rows }) => {
        const [weekday, ...dateParts] = day.replace(",", "").split(/\s+/);
        return (
          <div
            key={day}
            style={{
              display: "grid",
              gridTemplateColumns: `${compact ? 104 : 116}px minmax(0, 1fr)`,
              gap: compact ? 20 : 28,
              padding: compact ? "16px 22px" : "20px 26px",
              border: panels ? `2px solid ${theme.accent}` : "2px solid transparent",
              borderRadius: panels ? 18 : 0,
              background: panels ? theme.bg : "transparent",
              color: panels ? theme.fg : "#fff",
              textShadow: photoTextShadow,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", fontWeight: 700 }}>
              <span style={{ fontSize: compact ? 23 : 26, lineHeight: 1, letterSpacing: 1, textTransform: "uppercase" }}>
                {weekday}
              </span>
              {dateParts.length > 0 && (
                <span style={{ marginTop: 5, fontSize: compact ? 29 : 33, lineHeight: 1 }}>
                  {dateParts.join(" ")}
                </span>
              )}
            </div>
            <div style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: compact ? 16 : 22 }}>
              {rows.map((row, index) => (
                <div
                  key={`${row.time}-${row.name}-${index}`}
                  style={{ display: "grid", minWidth: 0, gridTemplateColumns: "138px minmax(0, 1fr)", gap: 16 }}
                >
                  <span style={{ fontSize: compact ? 29 : 34, fontWeight: 700 }}>{row.time}</span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        fontSize: compact ? 29 : 34,
                        fontWeight: 600,
                        lineHeight: 1.08,
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.name}
                    </span>
                    {row.sub && (
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          marginTop: 3,
                          color: panels ? theme.muted : "rgba(255,255,255,.86)",
                          fontSize: compact ? 23 : 27,
                          fontWeight: 600,
                          lineHeight: 1.1,
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.sub}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function rowSkin(style: StoryStyle, theme: StoryTheme, index: number): CSSProperties {
  switch (style.layout) {
    case "split":
      return { padding: "18px", border: `2px solid ${theme.fg}`, borderRadius: style.radius };
    case "party":
      return {
        padding: "18px 22px",
        border: `3px solid ${theme.fg}`,
        borderRadius: style.radius,
        background: `${index % 2 === 0 ? theme.accent : theme.fg}14`,
      };
    case "neon":
      return {
        padding: "16px 18px",
        border: `3px solid ${theme.accent}`,
        borderRadius: style.radius,
        background: `${theme.accent}0d`,
      };
    case "brutalist":
      return {
        padding: "17px 18px",
        border: `5px solid ${theme.fg}`,
        borderRadius: 0,
        boxShadow: `10px 10px 0 ${theme.accent}`,
      };
    default:
      if (style.chip) {
        return { padding: "14px 22px", borderRadius: style.radius, background: `${theme.faint}22` };
      }
      if (style.rule !== "none") {
        return { paddingBottom: 14, borderBottom: `${style.rule === "bold" ? 4 : 2}px solid ${theme.faint}55` };
      }
      return {};
  }
}

function DayHeading({
  day,
  style,
  theme,
  detailed,
}: {
  day: string;
  style: StoryStyle;
  theme: StoryTheme;
  detailed: boolean;
}) {
  const treatment: CSSProperties =
    style.layout === "split"
      ? { padding: "8px 13px", border: `2px solid ${theme.fg}`, borderRadius: 8, color: theme.fg }
      : style.layout === "party"
        ? { padding: "8px 17px", border: `3px solid ${theme.accent}`, borderRadius: 999, color: theme.fg }
        : style.layout === "neon"
          ? { paddingLeft: 14, borderLeft: `8px solid ${theme.accent}`, color: theme.accent }
          : style.layout === "brutalist"
            ? { paddingBottom: 5, borderBottom: `6px solid ${theme.fg}`, color: theme.fg }
            : {};
  return (
    <div
      style={{
        alignSelf: style.align === "center" ? "center" : "flex-start",
        margin: `${detailed ? 34 : 26}px 0 ${detailed ? 17 : 13}px`,
        color: theme.faint,
        fontSize: style.layout === "brutalist" ? (detailed ? 38 : 34) : (detailed ? 34 : 30),
        fontWeight: 600,
        letterSpacing: `${style.dayTrack}em`,
        lineHeight: 1,
        textTransform: "uppercase",
        ...treatment,
      }}
    >
      {day}
    </div>
  );
}

function StandardSchedule({
  days,
  style,
  theme,
  decoId,
  tier,
}: {
  days: PreviewDay[];
  style: StoryStyle;
  theme: StoryTheme;
  decoId: DecoId;
  tier: 1 | 2;
}) {
  const divided = decoId === "dividers" || decoId === "framed";
  const detailed = tier === 1;
  const nameSize = Math.round((detailed ? 50 : 44) * style.name);
  const subSize = Math.round((detailed ? 41 : 36) * style.name);
  const timeSize = detailed ? 43 : 38;
  const timeWidth = detailed ? 172 : 150;
  const rowGap = detailed ? 34 : 30;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {days.map(({ day, rows }, dayIndex) => (
        <div
          key={day}
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: divided && dayIndex > 0 ? `2px solid ${theme.faint}66` : undefined,
          }}
        >
          <DayHeading day={day} style={style} theme={theme} detailed={detailed} />
          {rows.map((row, index) => (
            <div
              key={`${day}-${row.time}-${row.name}-${index}`}
              style={{
                display: "flex",
                minWidth: 0,
                flexDirection: style.stackTime ? "column" : "row",
                alignItems: style.align === "center" ? "center" : "flex-start",
                gap: style.stackTime ? 4 : rowGap,
                marginBottom: style.layout === "brutalist" ? 28 : (detailed ? 22 : 18),
                ...rowSkin(style, theme, index),
              }}
            >
              {!style.stackTime && (
                <span
                  style={{
                    width: timeWidth,
                    flex: `0 0 ${timeWidth}px`,
                    alignSelf: "stretch",
                    display: "flex",
                    alignItems: style.layout === "split" ? "center" : "flex-start",
                    borderRight: style.layout === "split" ? `2px solid ${theme.fg}` : undefined,
                    color: style.layout === "neon" ? theme.accent : theme.time,
                    fontSize: timeSize,
                    fontWeight: 700,
                  }}
                >
                  {row.time}
                </span>
              )}
              <span
                style={{
                  display: "flex",
                  minWidth: 0,
                  flex: 1,
                  flexDirection: "column",
                  alignItems: style.align === "center" ? "center" : "flex-start",
                }}
              >
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    overflow: "hidden",
                    color: style.layout === "neon" ? theme.accent : undefined,
                    fontSize: nameSize,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    textAlign: style.align,
                    textOverflow: "ellipsis",
                    textTransform: style.upper ? "uppercase" : undefined,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </span>
                {style.stackTime && (
                  <span style={{ color: theme.time, fontSize: timeSize, fontWeight: 700 }}>{row.time}</span>
                )}
                {row.sub && (
                  <span
                    style={{
                      overflow: "hidden",
                      maxWidth: "100%",
                      color: style.layout === "neon" ? theme.accent : theme.faint,
                      fontSize: subSize,
                      lineHeight: 1.2,
                      textAlign: style.align,
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.sub}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SummarySchedule({
  layout,
  style,
  theme,
}: {
  layout: ShareStoryLayout;
  style: StoryStyle;
  theme: StoryTheme;
}) {
  const plain = style.layout === "plain";
  const fontSize = plain ? layout.plan.summaryFs : Math.min(layout.plan.summaryFs, 38);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {layout.plan.summary.map(({ day, entries }) => (
        <div
          key={day}
          style={{
            display: "flex",
            flexDirection: plain ? "row" : "column",
            marginBottom: style.layout === "brutalist" ? 36 : 26,
            ...(style.layout === "split"
              ? { border:`2px solid ${theme.fg}`, borderRadius:12, padding:16 }
              : style.layout === "party"
                ? { border:`3px solid ${theme.fg}`, borderRadius:24, padding:16 }
                : style.layout === "neon"
                  ? { border:`3px solid ${theme.accent}`, borderRadius:12, padding:16 }
                  : style.layout === "brutalist"
                    ? { border:`5px solid ${theme.fg}`, padding:16, boxShadow:`9px 9px 0 ${theme.accent}` }
                    : {}),
          }}
        >
          <span
            style={{
              width: plain ? 118 : "100%",
              flexShrink: 0,
              paddingTop: plain ? Math.max(2, Math.round((layout.plan.summaryFs * 1.3 - 36) / 2)) : 0,
              marginBottom: plain ? 0 : 10,
              color: style.layout === "neon" ? theme.accent : plain ? theme.faint : theme.fg,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {day}
          </span>
          <span
            style={{
              display: "flex",
              width: plain ? 764 : 840,
              flexDirection: "column",
              fontSize,
              lineHeight: 1.3,
            }}
          >
            {entries.map((entry) => (
              <span key={entry.name} style={{ display:"flex", width:"100%" }}>
                <span
                  style={{
                    display: plain ? "flex" : "block",
                    width: plain ? "auto" : 650,
                    overflow: plain ? undefined : "hidden",
                    color: style.layout === "neon" ? theme.accent : undefined,
                    fontWeight: 700,
                    textOverflow: plain ? undefined : "ellipsis",
                    textTransform: style.upper ? "uppercase" : undefined,
                    whiteSpace: plain ? undefined : "nowrap",
                  }}
                >
                  {entry.name}
                </span>
                <span
                  style={{
                    width: plain ? "auto" : 150,
                    marginLeft: plain ? Math.round(layout.plan.summaryFs * 0.32) : 20,
                    color: style.layout === "neon" ? theme.accent : theme.muted,
                    fontWeight: 600,
                    textAlign: plain ? "left" : "right",
                  }}
                >
                  {entry.times}
                </span>
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function SwissSchedule({ days, theme }: { days: PreviewDay[]; theme: StoryTheme }) {
  const columns = Math.max(1, Math.min(3, days.length));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, width: "100%" }}>
      {days.map(({ day, rows }, dayIndex) => (
        <div
          key={day}
          style={{
            minWidth: 0,
            minHeight: 250,
            marginBottom: 34,
            padding: `0 ${dayIndex % columns === columns - 1 ? 0 : 18}px 26px ${dayIndex % columns === 0 ? 0 : 18}px`,
            borderLeft: dayIndex % columns === 0 ? 0 : `3px solid ${theme.accent}`,
          }}
        >
          <div style={{ marginBottom: 24, fontSize: 28, fontWeight: 600, lineHeight: 1 }}>{day}</div>
          {rows.map((row, index) => (
            <div
              key={`${day}-${index}`}
              style={{
                minWidth: 0,
                marginTop: index === 0 ? 0 : 18,
                paddingTop: index === 0 ? 0 : 18,
                borderTop: index === 0 ? 0 : `2px solid ${theme.accent}`,
              }}
            >
              <div style={{ overflow: "hidden", fontSize: 48, fontWeight: 700, lineHeight: 0.98, textOverflow: "ellipsis" }}>
                {row.name}
              </div>
              {row.sub && <div style={{ marginTop: 8, fontSize: 27 }}>{row.sub}</div>}
              <div style={{ marginTop: 6, fontSize: 30, fontWeight: 600 }}>{row.time}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CowboySchedule({ days, theme }: { days: PreviewDay[]; theme: StoryTheme }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", width: "100%" }}>
      {days.map(({ day, rows }, dayIndex) => {
        const full = dayIndex % 3 === 2;
        const right = !full && dayIndex % 2 === 1;
        return (
          <div
            key={day}
            style={{
              minWidth: 0,
              gridColumn: full ? "1 / -1" : undefined,
              marginBottom: 24,
              padding: `0 ${right ? 0 : 30}px 20px ${right ? 30 : 0}px`,
              borderBottom: `4px solid ${theme.accent}`,
              textAlign: right ? "right" : "left",
            }}
          >
            <div
              style={{
                marginBottom: 15,
                fontSize: full ? 68 : 40,
                fontWeight: 800,
                letterSpacing: -2,
                lineHeight: 0.86,
                textTransform: "uppercase",
              }}
            >
              {day.split(",")[0]}
            </div>
            {rows.map((row, index) => (
              <div key={`${day}-${index}`} style={{ marginTop: index === 0 ? 0 : 12 }}>
                <div
                  style={{
                    overflow: "hidden",
                    fontSize: 31,
                    fontWeight: 800,
                    lineHeight: 0.98,
                    textOverflow: "ellipsis",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.name}
                </div>
                <div style={{ marginTop: 5, fontSize: 23, fontWeight: 600 }}>
                  {[row.time, row.sub].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Decorations({ decoId, theme, style }: { decoId: DecoId; theme: StoryTheme; style: StoryStyle }) {
  if (decoId === "none" || decoId === "dividers") return null;
  if (decoId === "top") {
    return <span aria-hidden="true" style={{ position: "absolute", inset: "0 0 auto", height: style.layout === "plain" ? 18 : 26, background: theme.accent }} />;
  }
  if (decoId === "double") {
    return (
      <>
        <span aria-hidden="true" style={{ position: "absolute", inset: 36, border: `3px solid ${theme.fg}`, borderRadius: 10 }} />
        <span aria-hidden="true" style={{ position: "absolute", inset: 52, border: `2px solid ${theme.faint}`, borderRadius: 6 }} />
      </>
    );
  }
  return <span aria-hidden="true" style={{ position: "absolute", inset: 40, border: `3px solid ${theme.fg}`, borderRadius: 8 }} />;
}

function ShareLivePreviewComponent({
  layout,
  themeId,
  styleId,
  typeId,
  decoId,
  backgroundPhotoUrl = null,
  backgroundX = 50,
  backgroundY = 50,
  backgroundZoom = 100,
  backgroundOverlay = 24,
  photoPanels = true,
  headlineY = 0,
  scheduleY = 0,
  handle,
  configKey,
  emptyLine = "Nothing on the calendar for these days yet.",
  onRendered,
  onBackgroundChange,
  onHeadlineYChange,
  onScheduleYChange,
  onDirectEditStart,
  onHeadlineTap,
  onScheduleTap,
}: ShareLivePreviewProps) {
  const theme = STORY_THEMES[themeId];
  const style = STORY_STYLES[styleId];
  const typeface: TypeFace = TYPEFACES.find((face) => face.id === typeId) ?? TYPEFACES[0];
  const days = previewDays(layout);
  const onPhoto = !!backgroundPhotoUrl;
  const url = `fittlist.co/${handle.replace(/^@/, "")}`;
  const editorialInk = style.layout === "swiss" || style.layout === "cowboy";
  const previewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0);
  const photoPointers = useRef(new Map<number, { x: number; y: number }>());
  const photoGesture = useRef({ x:backgroundX, y:backgroundY, zoom:backgroundZoom, centerX:0, centerY:0, distance:0 });
  const headlineGesture = useRef<{
    pointerId:number;
    startX:number;
    startY:number;
    value:number;
    min:number;
    max:number;
    moved:boolean;
  } | null>(null);
  const scheduleGesture = useRef<{
    pointerId:number;
    startX:number;
    startY:number;
    value:number;
    min:number;
    max:number;
    moved:boolean;
  } | null>(null);
  const wheelGestureTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (wheelGestureTimer.current !== null) window.clearTimeout(wheelGestureTimer.current);
  }, []);

  const beginPhotoGesture = () => {
    const points = [...photoPointers.current.values()];
    const a = points[0];
    const b = points[1] ?? a;
    photoGesture.current = {
      x:backgroundX,
      y:backgroundY,
      zoom:backgroundZoom,
      centerX:(a.x + b.x) / 2,
      centerY:(a.y + b.y) / 2,
      distance:Math.hypot(a.x - b.x, a.y - b.y),
    };
  };
  const movePhoto = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onBackgroundChange || !photoPointers.current.has(event.pointerId)) return;
    photoPointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
    const points = [...photoPointers.current.values()];
    const a = points[0];
    const b = points[1] ?? a;
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const start = photoGesture.current;
    const nextZoom = points.length > 1 && start.distance > 0
      ? clamped(start.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / start.distance), 100, 300, 100)
      : start.zoom;
    const zoomFactor = Math.max(1, nextZoom / 100);
    onBackgroundChange({
      x:clamped(start.x - ((centerX - start.centerX) / rect.width) * (100 / zoomFactor), 0, 100, 50),
      y:clamped(start.y - ((centerY - start.centerY) / rect.height) * (100 / zoomFactor), 0, 100, 50),
      zoom:Math.round(nextZoom),
    });
  };
  const endPhoto = (event: ReactPointerEvent<HTMLDivElement>) => {
    photoPointers.current.delete(event.pointerId);
    if (photoPointers.current.size) beginPhotoGesture();
  };

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return undefined;
    const fit = () => {
      const parent = preview.parentElement;
      const availableWidth = preview.clientWidth || parent?.clientWidth || 0;
      const availableHeight = preview.clientHeight || parent?.clientHeight || 0;
      if (!availableWidth || !availableHeight) return;
      const next = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);
      setPreviewScale((current) => Math.abs(current - next) > 0.0001 ? next : current);
    };
    fit();
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(preview);
    if (preview.parentElement) observer.observe(preview.parentElement);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    if (!onRendered) return;
    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const photo = previewRef.current?.querySelector("img");
    const photoReady = photo && typeof photo.decode === "function"
      ? photo.decode().catch(() => undefined)
      : Promise.resolve();
    const typeReady = typeface.file && typeof document.fonts?.load === "function"
      ? document.fonts.load(`400 16px "${typeface.family.replaceAll('"', "")}"`)
      : Promise.resolve();
    void Promise.allSettled([
      photoReady,
      document.fonts?.load("800 16px Delight") ?? Promise.resolve(),
      typeReady,
    ]).then(() => {
      if (cancelled) return;
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => onRendered(configKey));
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [backgroundPhotoUrl, configKey, onRendered, typeface.family, typeface.file]);

  const headlineStyle: CSSProperties = onPhoto
    ? {
        alignSelf: "flex-start",
        width: 840,
        padding: photoPanels ? "38px 48px" : 0,
        borderRadius: photoPanels ? 28 : 0,
        background: photoPanels ? theme.bg : "transparent",
        color: photoPanels ? theme.fg : "#fff",
        textShadow: photoPanels ? undefined : "0 4px 22px rgba(0,0,0,.92), 0 1px 4px rgba(0,0,0,1)",
      }
    : {
        maxWidth: 908,
        color: style.layout === "neon" || editorialInk ? theme.accent : theme.fg,
        ...(style.layout === "split"
          ? { paddingBottom: 18, borderBottom: `5px solid ${theme.fg}` }
          : style.layout === "brutalist"
            ? { paddingBottom: 12, borderBottom: `9px solid ${theme.fg}` }
            : editorialInk
              ? { paddingBottom: 18, borderBottom: `${style.layout === "cowboy" ? 8 : 3}px solid ${theme.accent}` }
              : {}),
      };

  return (
    <div
      ref={previewRef}
      className="shprev shprev-week shlive-preview"
      data-preview-kind="dom"
      data-config-key={configKey}
      role="img"
      aria-label="Your week as a share image"
    >
      <div
        ref={canvasRef}
        className="shlive-canvas"
        style={{
          position:"absolute",
          left:"50%",
          top:"50%",
          width:WIDTH,
          height:HEIGHT,
          transform:`translate(-50%, -50%) scale(${previewScale})`,
          transformOrigin:"center",
          visibility:previewScale > 0 ? "visible" : "hidden",
          touchAction:onPhoto && onBackgroundChange ? "none" : undefined,
        }}
        onPointerDown={(event) => {
          if (!onPhoto || !onBackgroundChange) return;
          if (photoPointers.current.size === 0) onDirectEditStart?.("background");
          event.currentTarget.setPointerCapture(event.pointerId);
          photoPointers.current.set(event.pointerId, { x:event.clientX, y:event.clientY });
          beginPhotoGesture();
        }}
        onPointerMove={movePhoto}
        onPointerUp={endPhoto}
        onPointerCancel={endPhoto}
        onWheel={(event: ReactWheelEvent<HTMLDivElement>) => {
          if (!onPhoto || !onBackgroundChange) return;
          event.preventDefault();
          if (wheelGestureTimer.current === null) onDirectEditStart?.("background");
          if (wheelGestureTimer.current !== null) window.clearTimeout(wheelGestureTimer.current);
          wheelGestureTimer.current = window.setTimeout(() => { wheelGestureTimer.current = null; }, 180);
          onBackgroundChange({
            x:backgroundX,
            y:backgroundY,
            zoom:Math.round(clamped(backgroundZoom - event.deltaY * 0.2, 100, 300, 100)),
          });
        }}
      >
        <div
          style={{
            position: "relative",
            width: WIDTH,
            height: HEIGHT,
            overflow: "hidden",
            boxSizing: "border-box",
            background: theme.bg,
            color: editorialInk ? theme.accent : theme.fg,
            fontFamily: "Delight, Helvetica Neue, Arial, sans-serif",
            WebkitFontSmoothing: "antialiased",
          }}
        >
          {backgroundPhotoUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backgroundPhotoUrl}
                alt=""
                decoding="async"
                style={{
                  position: "absolute",
                  width: `${clamped(backgroundZoom, 100, 300, 100)}%`,
                  height: `${clamped(backgroundZoom, 100, 300, 100)}%`,
                  left: `${-((clamped(backgroundZoom, 100, 300, 100) - 100) * clamped(backgroundX, 0, 100, 50)) / 100}%`,
                  top: `${-((clamped(backgroundZoom, 100, 300, 100) - 100) * clamped(backgroundY, 0, 100, 50)) / 100}%`,
                  objectFit: "cover",
                  objectPosition: `${clamped(backgroundX, 0, 100, 50)}% ${clamped(backgroundY, 0, 100, 50)}%`,
                }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `rgba(0,0,0,${clamped(backgroundOverlay, 0, 60, 24) / 100})`,
                }}
              />
            </>
          )}
          {!onPhoto && <Decorations decoId={decoId} theme={theme} style={style} />}

          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              padding: onPhoto ? "72px 64px 58px" : "104px 86px",
              color: onPhoto ? "#fff" : undefined,
            }}
          >
            {(layout.line1 || layout.line2) && (
              <div
                aria-label="Headline. Tap to edit or drag up and down to move it."
                style={{
                  position:"relative",
                  top:clamped(headlineY, SHARE_HEADLINE_Y_MIN, SHARE_HEADLINE_Y_MAX, 0),
                  display: "flex",
                  flexDirection: "column",
                  flex: "0 0 auto",
                  marginBottom: onPhoto ? 34 : editorialInk ? 54 : 78,
                  fontFamily: `${typeface.family}, Delight, Helvetica Neue, Arial, sans-serif`,
                  fontSize: layout.headlineSize,
                  fontStyle: typeface.italic ? "italic" : "normal",
                  fontWeight: 800,
                  letterSpacing: `${typeface.track ?? (typeface.id === "standard" ? -0.02 : 0)}em`,
                  lineHeight: style.layout === "cowboy" ? 0.84 : 0.98,
                  textTransform: style.upper ? "uppercase" : undefined,
                  touchAction:onHeadlineYChange ? "none" : undefined,
                  cursor:onHeadlineYChange ? "grab" : undefined,
                  ...headlineStyle,
                }}
                onPointerDown={(event) => {
                  if (!onHeadlineYChange) return;
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const scale = previewScale || 1;
                  const canvasRect = canvasRef.current?.getBoundingClientRect();
                  const headlineRect = event.currentTarget.getBoundingClientRect();
                  const min = canvasRect
                    ? headlineY + (canvasRect.top + SHARE_HEADLINE_EDGE_PEEK * scale - headlineRect.bottom) / scale
                    : SHARE_HEADLINE_Y_MIN;
                  const max = canvasRect
                    ? headlineY + (canvasRect.bottom - SHARE_HEADLINE_EDGE_PEEK * scale - headlineRect.top) / scale
                    : SHARE_HEADLINE_Y_MAX;
                  headlineGesture.current = {
                    pointerId:event.pointerId,
                    startX:event.clientX,
                    startY:event.clientY,
                    value:headlineY,
                    min:Math.max(SHARE_HEADLINE_Y_MIN, Math.round(Math.min(min, max))),
                    max:Math.min(SHARE_HEADLINE_Y_MAX, Math.round(Math.max(min, max))),
                    moved:false,
                  };
                }}
                onPointerMove={(event) => {
                  const gesture = headlineGesture.current;
                  if (!onHeadlineYChange || !gesture || gesture.pointerId !== event.pointerId) return;
                  event.stopPropagation();
                  if (!gesture.moved) {
                    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
                    gesture.moved = true;
                    onDirectEditStart?.("headline");
                  }
                  const scale = previewScale || 1;
                  onHeadlineYChange(Math.round(clamped(
                    gesture.value + (event.clientY - gesture.startY) / scale,
                    gesture.min,
                    gesture.max,
                    0,
                  )));
                }}
                onPointerUp={(event) => {
                  const gesture = headlineGesture.current;
                  if (gesture?.pointerId === event.pointerId) {
                    headlineGesture.current = null;
                    if (!gesture.moved) onHeadlineTap?.();
                  }
                  event.stopPropagation();
                }}
                onPointerCancel={(event) => {
                  if (headlineGesture.current?.pointerId === event.pointerId) headlineGesture.current = null;
                  event.stopPropagation();
                }}
              >
                <span>{layout.line1}</span>
                {layout.line2 && (
                  <span style={{ color: (style.layout === "party" || style.layout === "brutalist") ? theme.accent : undefined }}>
                    {layout.line2}
                  </span>
                )}
              </div>
            )}

            <FeatureCard layout={layout} theme={theme} onPhoto={onPhoto} panels={photoPanels} />

            {layout.plan.lifted && (
              <div style={{ marginBottom: 30, color: onPhoto ? "#fff" : theme.faint, fontSize: 36 }}>
                {layout.plan.lifted}
              </div>
            )}

            <div
              data-share-schedule="true"
              aria-label="Classes. Tap to edit or drag up and down to move them."
              style={{
                position:"relative",
                top:clamped(scheduleY, SHARE_SCHEDULE_Y_MIN, SHARE_SCHEDULE_Y_MAX, 0),
                flex:"0 0 auto",
                touchAction:onScheduleYChange ? "none" : undefined,
                cursor:onScheduleYChange ? "grab" : undefined,
              }}
              onPointerDown={(event) => {
                if (!onScheduleYChange) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                const scale = previewScale || 1;
                const canvasRect = canvasRef.current?.getBoundingClientRect();
                const scheduleRect = event.currentTarget.getBoundingClientRect();
                const min = canvasRect
                  ? scheduleY + (canvasRect.top + SHARE_SCHEDULE_EDGE_PEEK * scale - scheduleRect.bottom) / scale
                  : SHARE_SCHEDULE_Y_MIN;
                const max = canvasRect
                  ? scheduleY + (canvasRect.bottom - SHARE_SCHEDULE_EDGE_PEEK * scale - scheduleRect.top) / scale
                  : SHARE_SCHEDULE_Y_MAX;
                scheduleGesture.current = {
                  pointerId:event.pointerId,
                  startX:event.clientX,
                  startY:event.clientY,
                  value:scheduleY,
                  min:Math.max(SHARE_SCHEDULE_Y_MIN, Math.round(Math.min(min, max))),
                  max:Math.min(SHARE_SCHEDULE_Y_MAX, Math.round(Math.max(min, max))),
                  moved:false,
                };
              }}
              onPointerMove={(event) => {
                const gesture = scheduleGesture.current;
                if (!onScheduleYChange || !gesture || gesture.pointerId !== event.pointerId) return;
                event.stopPropagation();
                if (!gesture.moved) {
                  if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
                  gesture.moved = true;
                  onDirectEditStart?.("classes");
                }
                const scale = previewScale || 1;
                onScheduleYChange(Math.round(clamped(
                  gesture.value + (event.clientY - gesture.startY) / scale,
                  gesture.min,
                  gesture.max,
                  0,
                )));
              }}
              onPointerUp={(event) => {
                const gesture = scheduleGesture.current;
                if (gesture?.pointerId === event.pointerId) {
                  scheduleGesture.current = null;
                  if (!gesture.moved) onScheduleTap?.();
                }
                event.stopPropagation();
              }}
              onPointerCancel={(event) => {
                if (scheduleGesture.current?.pointerId === event.pointerId) scheduleGesture.current = null;
                event.stopPropagation();
              }}
            >
            {layout.empty ? (
              <div
                style={{
                  padding: onPhoto ? "28px 32px" : 0,
                  borderRadius: onPhoto ? 18 : 0,
                background: onPhoto && photoPanels ? theme.bg : undefined,
                color: onPhoto ? (photoPanels ? theme.fg : "#fff") : theme.faint,
                textShadow:onPhoto && !photoPanels ? "0 3px 18px rgba(0,0,0,.92)" : undefined,
                  fontSize: 40,
                  fontWeight: 600,
                }}
              >
                {emptyLine}
              </div>
            ) : onPhoto ? (
              <PhotoSchedule days={days} theme={theme} compact={layout.plan.tier !== 1} panels={photoPanels} />
            ) : style.narrative ? (
              <div style={{ display:"flex", flexDirection:"column", width:"100%", gap:22 }}>
                {days.map(({ day, rows }) => {
                  const rundown=rows.map((row) => `${row.name} at ${row.time}${row.sub ? ` (${row.sub})` : ""}`).join(rows.length === 2 ? " and " : "; ");
                  return <div key={day} style={{ display:"flex", flexDirection:"column", padding:"24px 28px", borderRadius:24, background:"rgba(255,255,255,.94)", color:"#14312a" }}><span style={{ marginBottom:10, color:"#405d52", fontSize:25, lineHeight:1, fontWeight:700, letterSpacing:2, textTransform:"uppercase" }}>{day}</span><span style={{ display:"-webkit-box", overflow:"hidden", WebkitBoxOrient:"vertical", WebkitLineClamp:4, fontSize:layout.plan.tier === 3 ? 34 : 40, lineHeight:1.18, fontWeight:650 }}>{`You’ve got ${rundown}.`}</span></div>;
                })}
              </div>
            ) : style.layout === "swiss" ? (
              <SwissSchedule days={days} theme={theme} />
            ) : style.layout === "cowboy" ? (
              <CowboySchedule days={days} theme={theme} />
            ) : layout.plan.tier === 3 ? (
              <SummarySchedule layout={layout} style={style} theme={theme} />
            ) : (
              <StandardSchedule
                days={days}
                style={style}
                theme={theme}
                decoId={decoId}
                tier={layout.plan.tier}
              />
            )}

            {layout.plan.moreDays > 0 && (
              <div style={{ marginTop: 12, color: onPhoto ? "#fff" : theme.faint, fontSize: 30, fontWeight: 600 }}>
                + {layout.plan.moreDays} more {layout.plan.moreDays === 1 ? "day" : "days"} at {url}
              </div>
            )}
            </div>

            <div
              style={{
                marginTop: "auto",
                display: "flex",
                flex: "0 0 auto",
                alignItems: "center",
                justifyContent: "space-between",
                padding: onPhoto ? "20px 24px" : "18px 0 0",
                borderTop: !onPhoto && ["neon", "swiss"].includes(style.layout)
                  ? `3px solid ${theme.accent}`
                  : !onPhoto && style.layout === "brutalist"
                    ? `7px solid ${theme.fg}`
                    : !onPhoto && style.layout === "cowboy"
                      ? `5px solid ${theme.accent}`
                      : undefined,
                borderRadius: onPhoto ? 18 : 0,
                background: onPhoto ? "#020D08" : undefined,
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {!onPhoto && <span style={{ color: theme.faint, fontSize: 30, fontWeight: 600, letterSpacing: 1 }}>See my schedule at</span>}
                <span style={{ fontSize: onPhoto ? 30 : 40, fontWeight: 600 }}>{url}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <BrandMark color={onPhoto ? "#8CF25F" : theme.lockupAccent ?? theme.accent} />
                <span
                  style={{
                    color: onPhoto ? "#fff" : editorialInk ? theme.accent : theme.fg,
                    fontFamily: "Delight, Helvetica Neue, Arial, sans-serif",
                    fontSize: onPhoto ? 42 : 50,
                    fontWeight: 800,
                    letterSpacing: -2,
                  }}
                >
                  FittList
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A live, client-only rendering of the current share configuration. It uses
 * the same deterministic layout model as the final ImageResponse but performs
 * no image-generation request, so visual edits commit at browser-paint speed.
 */
export const ShareLivePreview = memo(ShareLivePreviewComponent);
ShareLivePreview.displayName = "ShareLivePreview";
