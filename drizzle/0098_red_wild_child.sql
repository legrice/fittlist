CREATE TABLE "studio_closed_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"class_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_closed_days" ADD CONSTRAINT "studio_closed_days_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_closed_days" ADD CONSTRAINT "studio_closed_days_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_closed_days_once" ON "studio_closed_days" USING btree ("studio_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "studio_closed_days_date" ON "studio_closed_days" USING btree ("occurrence_date");