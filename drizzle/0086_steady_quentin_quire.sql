CREATE TABLE IF NOT EXISTS "group_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
UPDATE "group_members" SET "role" = 'owner' FROM "groups" WHERE "group_members"."group_id" = "groups"."id" AND "group_members"."user_id" = "groups"."owner_user_id";--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint
UPDATE "groups" SET "slug" = 'group-' || substring("id"::text, 1, 8) WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'unlisted' NOT NULL;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_favorites" ADD CONSTRAINT "group_favorites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_favorites" ADD CONSTRAINT "group_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_favorites_group_user" ON "group_favorites" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_favorites_user" ON "group_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_slug_unique" ON "groups" USING btree ("slug");
