ALTER TABLE "studios" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "photo" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "about" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_slug_unique" UNIQUE("slug");--> statement-breakpoint
-- Backfill a slug for every studio that already exists. The base is the name,
-- lowercased and hyphenated; where two studios share a base, the second and
-- later ones (oldest first, by seq) get a numeric suffix so the unique index
-- holds.
UPDATE "studios" SET "slug" = b.s FROM (
  SELECT id, CASE WHEN rn = 1 THEN base ELSE base || '-' || rn END AS s
  FROM (
    SELECT id, base, row_number() OVER (PARTITION BY base ORDER BY seq) AS rn
    FROM (
      SELECT id, seq,
             nullif(trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))), '') AS base
      FROM "studios"
    ) a
  ) c
) b WHERE "studios".id = b.id AND b.s IS NOT NULL;
