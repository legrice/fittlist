CREATE TABLE "studio_endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_studio_id" uuid NOT NULL,
	"endorser_user_id" uuid NOT NULL,
	"trait" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_endorsements" ADD CONSTRAINT "studio_endorsements_target_studio_id_studios_id_fk" FOREIGN KEY ("target_studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_endorsements" ADD CONSTRAINT "studio_endorsements_endorser_user_id_users_id_fk" FOREIGN KEY ("endorser_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_endorsements_place_trait" ON "studio_endorsements" USING btree ("target_studio_id","endorser_user_id","trait");--> statement-breakpoint
CREATE INDEX "studio_endorsements_target" ON "studio_endorsements" USING btree ("target_studio_id");