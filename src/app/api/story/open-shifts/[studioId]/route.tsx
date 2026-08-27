import { ImageResponse } from "next/og";
import { gymSchedule } from "@/app/actions/gym";

export const dynamic = "force-dynamic";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const timeLabel = (value: string) => {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;
  const query = new URL(request.url).searchParams;
  const offset = Math.max(0, Math.min(8, Number(query.get("w")) || 0));
  const studioName = query.get("name")?.trim().slice(0, 100) || "Studio schedule";
  const week = await gymSchedule(studioId, offset);
  if (!week) return new Response("Not found", { status: 404 });

  const openDays = week.days
    .map((day) => ({ ...day, items: day.items.filter((item) => !item.onUserId) }))
    .filter((day) => day.items.length > 0);
  const shifts = openDays.flatMap((day) => day.items.map((item) => ({ day, item })));
  const visible = shifts.slice(0, 13);

  return new ImageResponse(
    <div style={{
      width: "100%", height: "100%", padding: "92px 84px 74px", display: "flex",
      flexDirection: "column", background: "#f7f7f3", color: "#001a10",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 800 }}>
        <span style={{ color: "#92ed68", fontSize: 42 }}>F</span>
        FittList
      </div>
      <div style={{ marginTop: 76, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 14, fontSize: 38, fontWeight: 800 }}>{studioName}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: "#4f6258" }}>{week.label}</div>
        <div style={{ marginTop: 10, fontSize: 76, lineHeight: 1, fontWeight: 900 }}>Open shifts</div>
        <div style={{ marginTop: 18, fontSize: 28, color: "#4f6258" }}>
          {shifts.length} {shifts.length === 1 ? "shift needs" : "shifts need"} a coach
        </div>
      </div>

      <div style={{ marginTop: 62, display: "flex", flexDirection: "column" }}>
        {visible.map(({ day, item }, index) => (
          <div key={`${day.iso}-${item.id}`} style={{
            minHeight: 104, padding: "18px 0", display: "flex", alignItems: "center",
            borderTop: index === 0 ? "3px solid #0b3b2a" : "1px solid #bcc7c0",
          }}>
            <div style={{ width: 190, display: "flex", fontSize: 23, fontWeight: 700 }}>{dayLabel(day.iso)}</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <span style={{ fontSize: 30, fontWeight: 800 }}>{item.name}</span>
              <span style={{ fontSize: 22, color: "#4f6258" }}>{item.durationMin} min</span>
            </div>
            <div style={{ marginLeft: 20, fontSize: 27, fontWeight: 800 }}>{timeLabel(item.startTime)}</div>
          </div>
        ))}
        {shifts.length > visible.length && (
          <div style={{ paddingTop: 22, display: "flex", fontSize: 24, fontWeight: 700 }}>
            + {shifts.length - visible.length} more open shifts
          </div>
        )}
      </div>

      <div style={{ marginTop: "auto", padding: "24px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 24, background: "#062b1f", color: "white" }}>
        <span style={{ fontSize: 27, fontWeight: 800 }}>Can you cover one?</span>
        <span style={{ fontSize: 23, color: "#92ed68", fontWeight: 800 }}>fittlist.co</span>
      </div>
    </div>,
    { width: 1080, height: 1920 },
  );
}
