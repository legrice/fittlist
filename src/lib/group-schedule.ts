import { and, eq, gte, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { schema } from "@/db";

/** A group selection is a reference, not a copy of the coach's permissions
 * or recurrence. Recheck both after a cancellation, end-date or privacy edit.
 * This matches runsOn using the selected occurrence date inside the query. */
export function publicGroupOccurrenceFilter(): SQL {
  return publicClassOccurrenceFilter(schema.groupClasses.occurrenceDate);
}

export function publicClassOccurrenceFilter(occurrenceDate: AnyPgColumn): SQL {
  return and(
    eq(schema.classes.isPublic, true),
    or(
      eq(schema.classes.specificDate, occurrenceDate),
      and(
        isNull(schema.classes.specificDate),
        eq(schema.classes.dayOfWeek, sql<number>`extract(isodow from ${occurrenceDate})::integer - 1`),
        or(isNull(schema.classes.endsOn), gte(schema.classes.endsOn, occurrenceDate)),
      ),
    ),
    sql`not (${schema.classes.skipDates} @> jsonb_build_array(${occurrenceDate}::text))`,
  )!;
}

/** A favorite is a shortcut; it never grants access to a private group. */
export function visibleGroupFilter(viewerId: string | null): SQL {
  const publicGroup = ne(schema.groups.visibility, "private");
  if (!viewerId) return publicGroup;
  return or(
    publicGroup,
    eq(schema.groups.ownerUserId, viewerId),
    sql`exists (select 1 from ${schema.groupMembers} as viewer_membership where viewer_membership.group_id = ${schema.groups.id} and viewer_membership.user_id = ${viewerId})`,
  )!;
}
