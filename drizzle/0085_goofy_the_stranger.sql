ALTER TABLE "group_members" ADD COLUMN "share_mode" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "invite_token" text;--> statement-breakpoint
UPDATE "groups" SET "invite_token" = md5(random()::text || clock_timestamp()::text || "id"::text) WHERE "invite_token" IS NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "invite_token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_invite_token_unique" UNIQUE("invite_token");
