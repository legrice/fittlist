ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
UPDATE "groups" SET "slug" = 'group-' || substring("id"::text, 1, 8) WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "visibility" text DEFAULT 'unlisted' NOT NULL;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "purpose" text DEFAULT 'plan' NOT NULL;
--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
UPDATE "group_members" SET "role" = 'owner' FROM "groups" WHERE "group_members"."group_id" = "groups"."id" AND "group_members"."user_id" = "groups"."owner_user_id";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "class_id" uuid NOT NULL,
  "occurrence_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL,
  "invitee_user_id" uuid NOT NULL,
  "invited_by_user_id" uuid NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_favorites" ADD CONSTRAINT "group_favorites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_favorites" ADD CONSTRAINT "group_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade; EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "groups_slug_unique" ON "groups" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_classes_group_class_date" ON "group_classes" ("group_id", "class_id", "occurrence_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_classes_group" ON "group_classes" ("group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_favorites_group_user" ON "group_favorites" ("group_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_favorites_user" ON "group_favorites" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_invitations_group_invitee" ON "group_invitations" ("group_id", "invitee_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_invitations_invitee" ON "group_invitations" ("invitee_user_id");
