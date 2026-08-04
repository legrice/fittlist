import { readFileSync } from "fs";
import { join } from "path";
import { eq, inArray } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { getDb, schema } from "@/db";
import { brandIcon } from "@/lib/brand";
import { DAYS, fmtTime, runsOn, storyTheme, timeToMinutes, todayIso as todayIsoNow } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { listBudget, planStory } from "@/lib/storyplan";

// The member's share image: the classes they marked "going" this week, across
// every coach and studio. The mirror of the coach's "Train with me" — this one
// says "come with me", and it carries the coaches' names out to the member's
// friends, who are exactly the people most likely to show up.

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

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Not found", { status: 404 });
  const qs = new URL(req.url).searchParams;
  const [, t] = storyTheme(qs.get("theme"));
  const markUri = iconUri(t.lockupAccent ?? t.accent);

  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) return new Response("Not found", { status: 404 });

  // The window. A week is the most it will ever be (the canvas can't hold
  // more and nobody plans further than that out loud), a day is the least,
  // and it starts wherever they asked. Defaulting to today is what made a
  // poster come back empty for somebody whose only class was nine days out.
  const todayIso = todayIsoNow();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(qs.get("from") ?? "") ? qs.get("from")! : todayIso;
  const span = Math.min(7, Math.max(1, Number(qs.get("days")) || 7));
  const dates: string[] = [];
  for (let i = 0; i < span; i++) {
    dates.push(new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));
  }
  const inRange = new Set(dates);

  const [going, own] = await Promise.all([
    db
      .select({
        classId: schema.attendances.classId,
        occurrenceDate: schema.attendances.occurrenceDate,
      })
      .from(schema.attendances)
      .where(eq(schema.attendances.userId, userId)),
    db.select().from(schema.personalClasses).where(eq(schema.personalClasses.userId, userId)),
  ]);
  const classIds = [...new Set(going.map((g) => g.classId))];
  const classRows = classIds.length
    ? (await db.select().from(schema.classes).where(inArray(schema.classes.id, classIds))).filter(
        (c) => c.isPublic,
      )
    : [];

  const coachIds = [...new Set(classRows.map((c) => c.userId))];
  const coaches = coachIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coaches.map((c) => [c.id, c]));

  const studioIds = [
    ...new Set(
      [...classRows.map((c) => c.studioId), ...own.map((p) => p.studioId)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const studios = studioIds.length
    ? await db.select().from(schema.studios).where(inArray(schema.studios.id, studioIds))
    : [];
  const studioName = new Map(studios.map((s) => [s.id, s.name]));

  // Both halves of a week, on one poster. The classes they marked Going at a
  // coach, and the ones they keep themselves: a poster that quietly dropped
  // half of somebody's week is worse than no poster, and their own entries are
  // exactly the ones with a coach who isn't here yet.
  const classById = new Map(classRows.map((c) => [c.id, c]));
  type Row = { startTime: string; name: string; where: string; who: string };
  const rowsByDate = new Map<string, Row[]>();
  const put = (iso: string, r: Row) => rowsByDate.set(iso, [...(rowsByDate.get(iso) ?? []), r]);
  for (const g of going) {
    const c = classById.get(g.classId);
    if (!c || !inRange.has(g.occurrenceDate)) continue;
    put(g.occurrenceDate, {
      startTime: c.startTime,
      name: c.name,
      where: (c.studioId && studioName.get(c.studioId)) || c.location || "",
      who: coachById.get(c.userId)?.name?.trim().split(/\s+/)[0] ?? "",
    });
  }
  for (const p of own) {
    for (const iso of dates) {
      const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
      if (!runsOn(p, iso, dow)) continue;
      put(iso, {
        startTime: p.startTime,
        name: p.name,
        where: (p.studioId && studioName.get(p.studioId)) || p.location || "",
        who: p.withWho.trim().split(/\s+/)[0] ?? "",
      });
    }
  }
  const byDay = dates
    .filter((iso) => (rowsByDate.get(iso) ?? []).length > 0)
    .map((iso) => ({
      day: DAYS[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7],
      items: (rowsByDate.get(iso) ?? []).sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
      ),
    }));

  // What it says at the top. One day is a day, and a range that starts today
  // is still "my week"; anything else names both ends.
  const shortDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const last = dates[dates.length - 1];
  const kicker =
    span === 1
      ? shortDate(from)
      : from === todayIso
        ? `My week of ${shortDate(from)}`
        : `${shortDate(from)} to ${shortDate(last)}`;

  const prefs = me.storyPrefs ?? {};
  let line1 = "Come train";
  let line2 = "with me.";
  if (prefs.headline) {
    const words = prefs.headline.split(" ");
    const cut = Math.ceil(words.length / 2);
    line1 = words.slice(0, cut).join(" ");
    line2 = words.slice(cut).join(" ");
  }
  const maxLine = Math.max(line1.length, line2.length);
  const hSize = maxLine <= 9 ? 104 : maxLine <= 13 ? 86 : 70;
  const showPhoto = prefs.showPhoto !== false && !!me.photo;
  // Said once, from the profile: a studio's name places nobody who is not
  // already local.
  const city = (me.location ?? "").trim();
  // A member's own poster points at their own page when they have claimed a
  // handle. Without one there is nothing to point at but the front door.
  const myHandle = (me.handle ?? "").trim();

  // Same three levels of detail as the coach's poster, for the same reason:
  // the canvas doesn't grow, so a full week has to summarise rather than run
  // off the bottom of it.
  const plan = planStory(
    byDay.map(({ day, items }) => ({
      day,
      items: items.map((c) => ({
        time: fmtTime(c.startTime),
        name: c.name,
        where: c.where,
        who: c.who,
      })),
    })),
    listBudget(hSize * 0.98 * (line2 ? 2 : 1) + 78, !!city),
  );
  const m =
    plan.tier === 1
      ? { dayFs: 34, dayMt: 34, dayMb: 17, timeFs: 43, timeW: 172, gap: 34, nameFs: 48, subFs: 41, rowMb: 22, colW: 702 }
      : { dayFs: 30, dayMt: 26, dayMb: 13, timeFs: 38, timeW: 150, gap: 30, nameFs: 42, subFs: 36, rowMb: 18, colW: 728 };

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
          padding: "240px 86px 280px",
          fontFamily: "Delight",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 26,
            background: t.accent,
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            fontWeight: 700,
            fontSize: 34,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: t.muted,
            marginBottom: 30,
          }}
        >
          {/* The range it actually drew, not the day it was made. A poster
              headed "My week of Aug 1" showing next Tuesday is a poster
              nobody can trust. */}
          {kicker}
        </div>
        {showPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={me.photo!}
            alt=""
            width={172}
            height={172}
            style={{
              position: "absolute",
              top: 232,
              right: 86,
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
            letterSpacing: -3,
            textTransform: "uppercase",
            marginBottom: 78,
            maxWidth: showPhoto ? 690 : 908,
          }}
        >
          <span>{line1}</span>
          {line2 && <span style={{ color: t.accent }}>{line2}</span>}
        </div>

        {/* What every class has in common, said once instead of on every row. */}
        {city && (
          <div style={{ display: "flex", fontSize: 38, color: t.faint, marginTop: -58, marginBottom: 34 }}>
            {city}
          </div>
        )}

        {plan.lifted && (
          <div style={{ display: "flex", fontSize: 36, color: t.faint, marginBottom: 30 }}>
            {plan.lifted}
          </div>
        )}

        {byDay.length === 0 ? (
          <div style={{ display: "flex", color: t.faint, fontSize: 44 }}>
            Nothing marked yet this week.
          </div>
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
                + {plan.moreDays} more {plan.moreDays === 1 ? "day" : "days"} at fittlist.co
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
                    letterSpacing: 4,
                    textTransform: "uppercase",
                    color: t.faint,
                    margin: `${m.dayMt}px 0 ${m.dayMb}px`,
                  }}
                >
                  {day}
                </div>
                {rows.map((r, i) => (
                  <div
                    key={`${day}-${i}`}
                    style={{ display: "flex", gap: m.gap, marginBottom: m.rowMb }}
                  >
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
                    {/* Bounded, so a long class name wraps instead of running
                        off the right edge of the image. 1080 canvas less
                        2x86 padding, less the time column and the gap. Satori
                        won't wrap a flex child that has no width to wrap
                        inside. */}
                    <div style={{ display: "flex", flexDirection: "column", width: m.colW }}>
                      <span style={{ fontSize: m.nameFs, fontWeight: 700, lineHeight: 1.15 }}>
                        {r.name}
                      </span>
                      {r.sub && (
                        <span style={{ fontSize: m.subFs, color: t.faint, lineHeight: 1.2 }}>
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
            <span style={{ fontWeight: 600, fontSize: 30, color: t.faint, letterSpacing: 1 }}>
              Join me
            </span>
            <span style={{ fontWeight: 600, fontSize: 40 }}>
              {myHandle ? `fittlist.co/${myHandle}` : "fittlist.co"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markUri} alt="" width={56} height={57} />
            <span style={{ fontWeight: 800, fontSize: 50, color: t.fg, letterSpacing: -2 }}>
              FittList
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      fonts: loadFonts(),
      headers: { "Cache-Control": "no-store" },
    },
  );
}
