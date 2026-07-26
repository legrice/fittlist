CREATE TABLE "coach_studios" (
	"user_id" uuid NOT NULL,
	"studio_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coach_studios" ADD CONSTRAINT "coach_studios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_studios" ADD CONSTRAINT "coach_studios_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_studios_user_studio" ON "coach_studios" USING btree ("user_id","studio_id");--> statement-breakpoint
-- Existing coaches have already set up their pages; mark them onboarded so only
-- brand-new signups are routed into the setup wizard.
UPDATE "users" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL AND "handle" IS NOT NULL;