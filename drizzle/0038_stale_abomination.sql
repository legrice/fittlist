-- A recurring class needs its own identity, separate from the template.
--
-- The template is keyed on (user_id, name), so a coach teaching Stretch+ at two
-- studios had one template across both. Editing either one deleted every weekly
-- row carrying that template and rewrote them as a single class, which is how a
-- schedule "disappeared" after a description edit.
--
-- Added nullable first and backfilled by group: adding it with the default in
-- one step gives every weekday row a distinct id, which would split every
-- existing weekly class into unrelated single days.
ALTER TABLE "classes" ADD COLUMN "series_id" uuid;--> statement-breakpoint

-- Reconstruct the sets: weekly rows that share a coach, a template, a time, a
-- place and a visibility were one class.
WITH grp AS (
  SELECT
    user_id,
    template_id,
    start_time,
    COALESCE(studio_id::text, '') AS studio_key,
    COALESCE(location, '') AS location_key,
    is_public,
    COALESCE(ends_on::text, '') AS ends_key,
    gen_random_uuid() AS sid
  FROM "classes"
  WHERE specific_date IS NULL AND template_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7
)
UPDATE "classes" c
SET series_id = g.sid
FROM grp g
WHERE c.specific_date IS NULL
  AND c.template_id IS NOT NULL
  AND c.user_id = g.user_id
  AND c.template_id = g.template_id
  AND c.start_time = g.start_time
  AND COALESCE(c.studio_id::text, '') = g.studio_key
  AND COALESCE(c.location, '') = g.location_key
  AND c.is_public = g.is_public
  AND COALESCE(c.ends_on::text, '') = g.ends_key;--> statement-breakpoint

-- One-offs, and anything with no template, stand alone.
UPDATE "classes" SET series_id = gen_random_uuid() WHERE series_id IS NULL;--> statement-breakpoint

ALTER TABLE "classes" ALTER COLUMN "series_id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "series_id" SET NOT NULL;
