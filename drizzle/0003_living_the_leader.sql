ALTER TABLE "users" ALTER COLUMN "theme" SET DEFAULT 'poster';--> statement-breakpoint
UPDATE "users" SET "theme" = 'poster' WHERE "theme" = 'classic';
