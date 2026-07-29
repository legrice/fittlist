import { clockParts, fmtDayHeader } from "@/lib/format";

export type TextDay = {
  iso: string;
  items: { name: string; startTime: string; where?: string | null }[];
};

/**
 * A week as plain text, for pasting into a group chat or a story.
 *
 * The share image is the pretty version and it's the right one for Instagram.
 * It is also useless in a text thread, which is where a coach actually answers
 * "what are you teaching this week?". This is that answer, ready to paste.
 */
export function weekAsText(days: TextDay[], lead?: string): string {
  const out: string[] = [];
  if (lead?.trim()) out.push(lead.trim(), "");
  for (const d of days) {
    if (!d.items.length) continue;
    // check-copy-ignore: the date label carries its own dash.
    out.push(fmtDayHeader(d.iso));
    for (const i of d.items) {
      const { hm, ap } = clockParts(i.startTime);
      const when = `${hm}${ap.toLowerCase()}`;
      out.push(`  ${when}  ${i.name}${i.where ? ` · ${i.where}` : ""}`);
    }
    out.push("");
  }
  // One trailing blank line is tidy; three is someone forgot to trim.
  return out.join("\n").replace(/\n{3,}$/, "\n").trimEnd();
}
