/** Describe every activity category in the owner's visible week, including private plans. */
export function calendarActivitySummary({ teaching, attending, personal, studios = 0 }: {
  teaching: number; attending: number; personal: number; studios?: number;
}) {
  const classes = (n: number) => n === 1 ? "class" : "classes";
  const activities = `${personal} ${personal === 1 ? "workout" : "workouts"}`;
  const studioText = studios ? ` at ${studios} ${studios === 1 ? "studio" : "studios"}` : "";
  const publicSummary = teaching && attending
    ? `You’re teaching ${teaching} ${classes(teaching)} and attending ${attending} this week.`
    : teaching
      ? `You’re teaching ${teaching} ${classes(teaching)}${studioText} this week.`
      : attending ? `You’re attending ${attending} ${classes(attending)} this week.` : "";
  if (personal) return publicSummary
    ? `${publicSummary} You also have ${activities} planned.`
    : `You’ve got ${activities} planned this week.`;
  return publicSummary || "You have nothing scheduled this week.";
}
