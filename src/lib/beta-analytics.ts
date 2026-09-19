export const USAGE_KINDS = ["app_active", "web_active", "ios_active", "android_active", "calendar_viewed", "explore_viewed", "class_viewed", "screen_error"] as const;
export type UsageKind = typeof USAGE_KINDS[number];
const DAY = 86400000;
const meaningful = new Set(["class_saved", "favorite_person_added", "favorite_studio_added", "favorite_group_added", "class_updated", "group_joined", "group_created", "share_image_exported", "event_registration"]);
export type AnalyticsPerson = { id: string; email: string; name: string; kind: string; createdAt: Date; onboardedAt: Date | null; signupSource: string | null };
export type AnalyticsEvent = { actorUserId: string | null; kind: string; createdAt: Date };
export function betaAnalytics(people: AnalyticsPerson[], events: AnalyticsEvent[], excludedEmails: string[], now = new Date(), days = 7) {
  const excluded = new Set([...excludedEmails, "review@fittlist.co"].map(email => email.trim().toLowerCase()));
  const users = people.filter(person => !["gym", "placeholder"].includes(person.kind) && !excluded.has(person.email.toLowerCase()));
  const byId = new Map(users.map(person => [person.id, person]));
  const known = events.filter(event => event.actorUserId && byId.has(event.actorUserId) && event.createdAt <= now);
  const since = now.getTime() - days * DAY;
  const recent = known.filter(event => event.createdAt.getTime() >= since);
  const unique = (rows: AnalyticsEvent[]) => new Set(rows.map(event => event.actorUserId)).size;
  const active = recent.filter(event => event.kind !== "screen_error");
  const fresh = users.filter(person => person.createdAt.getTime() >= since && person.createdAt <= now);
  const actionUsers = new Set(known.filter(event => meaningful.has(event.kind)).map(event => event.actorUserId));
  const observed = known.filter(event => event.kind === "app_active");
  const firstObserved = observed.length ? Math.min(...observed.map(event => event.createdAt.getTime())) : null;
  // Only fully observed, mature cohorts qualify; missing historic app opens are not zero retention.
  const eligible = firstObserved === null ? [] : users.filter(person => person.createdAt.getTime() >= firstObserved && person.createdAt.getTime() <= now.getTime() - 14 * DAY && person.createdAt.getTime() >= now.getTime() - 28 * DAY);
  const returned = eligible.filter(person => known.some(event => event.actorUserId === person.id && event.kind !== "screen_error" && event.createdAt.getTime() >= person.createdAt.getTime() + 7 * DAY && event.createdAt.getTime() < person.createdAt.getTime() + 14 * DAY));
  const previous = known.filter(event => event.kind !== "screen_error" && event.createdAt.getTime() >= since - days * DAY && event.createdAt.getTime() < since);
  const priorIds = new Set(previous.map(event => event.actorUserId));
  const labels: [string, string[]][] = [
    ["Calendar opened", ["calendar_viewed"]], ["Explore opened", ["explore_viewed"]], ["Class details opened", ["class_viewed"]],
    ["Classes saved", ["class_saved"]], ["Classes removed", ["class_removed"]],
    ["People followed", ["favorite_person_added"]], ["Studios followed", ["favorite_studio_added"]], ["Groups followed", ["favorite_group_added"]],
    ["Share images exported", ["share_image_exported"]], ["Groups joined", ["group_joined"]], ["Classes published or updated", ["class_updated"]],
    ["Messages sent", ["message_sent"]], ["Screen errors", ["screen_error"]],
  ];
  const sources = new Map<string, number>();
  fresh.forEach(person => sources.set(person.signupSource || "direct", (sources.get(person.signupSource || "direct") || 0) + 1));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - 1 - index) * DAY).toISOString().slice(0, 10);
    const rows = known.filter(event => event.createdAt.toISOString().slice(0, 10) === date);
    return { date, active: unique(rows.filter(event => event.kind !== "screen_error")), saves: rows.filter(event => event.kind === "class_saved").length };
  });
  const platformKinds = ["web_active", "ios_active", "android_active"] as const;
  const platformEvents = recent.filter(event => event.kind === "app_active" || platformKinds.some(kind => kind === event.kind));
  const platformByPerson = new Map<string, AnalyticsEvent[]>();
  platformEvents.forEach(event => {
    const id = event.actorUserId!;
    platformByPerson.set(id, [...(platformByPerson.get(id) || []), event]);
  });
  const visitors = [...platformByPerson].map(([id, visits]) => {
    const person = byId.get(id)!;
    const daysFor = (kind: string) => new Set(visits.filter(visit => visit.kind === kind).map(visit => visit.createdAt.toISOString().slice(0, 10))).size;
    const classifiedDays = new Set(visits.filter(visit => platformKinds.some(kind => kind === visit.kind)).map(visit => visit.createdAt.toISOString().slice(0, 10)));
    const unclassifiedDays = new Set(visits.filter(visit => visit.kind === "app_active" && !classifiedDays.has(visit.createdAt.toISOString().slice(0, 10))).map(visit => visit.createdAt.toISOString().slice(0, 10))).size;
    return {
      id, name: person.name || person.email, email: person.email,
      webDays: daysFor("web_active"), iosDays: daysFor("ios_active"), androidDays: daysFor("android_active"), unclassifiedDays,
      lastRecorded: new Date(Math.max(...visits.map(visit => visit.createdAt.getTime()))).toISOString(),
    };
  }).sort((a, b) => b.lastRecorded.localeCompare(a.lastRecorded));
  return {
    days, newUsers: fresh.length, onboarded: fresh.filter(person => person.onboardedAt).length,
    activated: fresh.filter(person => actionUsers.has(person.id)).length,
    active: unique(active), previousActive: unique(previous), returning: unique(active.filter(event => priorIds.has(event.actorUserId))),
    today: unique(known.filter(event => event.kind !== "screen_error" && event.createdAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10))),
    retention: { eligible: eligible.length, returned: returned.length },
    firstObserved: firstObserved === null ? null : new Date(firstObserved).toISOString().slice(0, 10),
    features: labels.map(([label, kinds]) => { const rows = recent.filter(event => kinds.includes(event.kind)); return { label, users: unique(rows), events: kinds.some(kind => USAGE_KINDS.includes(kind as UsageKind)) ? new Set(rows.map(row => `${row.actorUserId}:${row.createdAt.toISOString().slice(0,10)}`)).size : rows.length, dailySignal: kinds.some(kind => USAGE_KINDS.includes(kind as UsageKind)) }; }),
    sources: [...sources].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count), daily, visitors,
    stuck: fresh.filter(person => (!person.onboardedAt && person.createdAt.getTime() < now.getTime() - DAY) || (!actionUsers.has(person.id) && person.createdAt.getTime() < now.getTime() - 2 * DAY)).slice(0, 20).map(person => ({ id: person.id, name: person.name || person.email, email: person.email, reason: !person.onboardedAt ? "Onboarding incomplete after 24 hours" : "No recorded core action after 48 hours" })),
  };
}
export type BetaAnalytics = ReturnType<typeof betaAnalytics>;
