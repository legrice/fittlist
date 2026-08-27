CREATE TABLE "apple_identities" (
	"subject" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_native_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"context_id" uuid,
	"author_user_id" uuid,
	"reporter_user_id" uuid,
	"reporter_key" text NOT NULL,
	"reporter_label" text DEFAULT 'Community member' NOT NULL,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"href" text,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by_user_id" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_templates" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN "sync_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiry_threads" ADD COLUMN "requester_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
UPDATE "users" AS u
SET "time_zone" = gc."time_zone"
FROM "google_connections" AS gc
WHERE gc."user_id" = u."id" AND gc."time_zone" IS NOT NULL;--> statement-breakpoint
UPDATE "studios" AS s
SET "time_zone" = u."time_zone"
FROM "users" AS u
WHERE u."id" = s."owner_user_id";--> statement-breakpoint
UPDATE "classes" AS c
SET "time_zone" = u."time_zone"
FROM "users" AS u
WHERE u."id" = c."user_id";--> statement-breakpoint
UPDATE "classes" AS c
SET "time_zone" = s."time_zone"
FROM "studios" AS s
WHERE s."id" = c."studio_id";--> statement-breakpoint
UPDATE "class_templates" AS t
SET "time_zone" = u."time_zone"
FROM "users" AS u
WHERE u."id" = t."user_id";--> statement-breakpoint
UPDATE "class_templates" AS t
SET "time_zone" = s."time_zone"
FROM "studios" AS s
WHERE s."id" = t."studio_id";--> statement-breakpoint
UPDATE "personal_classes" AS p
SET "time_zone" = u."time_zone"
FROM "users" AS u
WHERE u."id" = p."user_id";--> statement-breakpoint
UPDATE "personal_classes" AS p
SET "time_zone" = s."time_zone"
FROM "studios" AS s
WHERE s."id" = p."studio_id";--> statement-breakpoint
UPDATE "events" AS e
SET "time_zone" = u."time_zone"
FROM "users" AS u
WHERE u."id" = e."created_by_user_id";--> statement-breakpoint
ALTER TABLE "apple_identities" ADD CONSTRAINT "apple_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_handled_by_user_id_users_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apple_identities_user" ON "apple_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apple_native_challenges_expiry" ON "apple_native_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_once" ON "content_reports" USING btree ("content_type","content_id","reporter_key") WHERE "content_reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "content_reports_status_created" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_author" ON "content_reports" USING btree ("author_user_id");
