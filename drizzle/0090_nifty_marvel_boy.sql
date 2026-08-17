ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "invite_token" text;
--> statement-breakpoint
UPDATE "groups" SET "invite_token" = md5(random()::text || clock_timestamp()::text || "id"::text) WHERE "invite_token" IS NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "invite_token" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_invite_token_unique" ON "groups" ("invite_token");
