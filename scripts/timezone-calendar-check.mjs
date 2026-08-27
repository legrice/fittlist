import assert from "node:assert/strict";
import {
  isoDateInTimeZone,
  isValidTimeZone,
  utcCalendarStamp,
  zonedDateTimeToDate,
} from "../src/lib/timezone.ts";
import {
  icsFold,
  recurrenceLines,
  vTimeZoneLines,
  weeklyRule,
  zonedEndLine,
} from "../src/lib/ics.ts";

assert.equal(isValidTimeZone("America/New_York"), true);
assert.equal(isValidTimeZone("Europe/London"), true);
assert.equal(isValidTimeZone("Not/A_Time_Zone"), false);

assert.equal(
  zonedDateTimeToDate("2026-03-07", "06:00", "America/New_York").toISOString(),
  "2026-03-07T11:00:00.000Z",
);
assert.equal(
  zonedDateTimeToDate("2026-03-09", "06:00", "America/New_York").toISOString(),
  "2026-03-09T10:00:00.000Z",
);
assert.equal(
  utcCalendarStamp("2026-11-01", "23:59", "America/New_York", 59),
  "20261102T045959Z",
);
assert.equal(
  isoDateInTimeZone(new Date("2026-01-01T00:30:00Z"), "America/Los_Angeles"),
  "2025-12-31",
);

assert.equal(
  weeklyRule(6, "2026-03-08", "America/New_York"),
  "RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260309T035959Z",
);
assert.deepEqual(
  recurrenceLines(0, null, ["2026-09-07"], "06:30", "America/New_York"),
  [
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "EXDATE;TZID=America/New_York:20260907T063000",
  ],
);
assert.equal(
  zonedEndLine("2026-08-27", "23:30", 90, "Europe/London"),
  "DTEND;TZID=Europe/London:20260828T010000",
);

const folded = icsFold(`SUMMARY:${"🏋️".repeat(40)} class`);
for (const line of folded.split("\r\n")) {
  assert.ok(Buffer.byteLength(line, "utf8") <= 75, `folded line exceeds 75 octets: ${line}`);
}
assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${"🏋️".repeat(40)} class`);

const vtimezone = vTimeZoneLines("America/New_York");
assert.ok(vtimezone.includes("BEGIN:VTIMEZONE"));
assert.ok(vtimezone.includes("TZID:America/New_York"));
assert.ok(vtimezone.some((line) => line === "TZOFFSETFROM:-0500"));
assert.ok(vtimezone.some((line) => line === "TZOFFSETTO:-0400"));
assert.equal(vtimezone.at(-1), "END:VTIMEZONE");

const longExdate = icsFold(recurrenceLines(
  0,
  null,
  ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"],
  "06:30",
  "America/New_York",
)[1]);
for (const line of longExdate.split("\r\n")) {
  assert.ok(Buffer.byteLength(line, "utf8") <= 75, "folded EXDATE exceeds 75 octets");
}

console.log("timezone and iCalendar DST checks passed");
