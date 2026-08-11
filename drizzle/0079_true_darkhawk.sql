CREATE TABLE "profile_endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_user_id" uuid NOT NULL,
	"endorser_user_id" uuid NOT NULL,
	"trait" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_endorsements" ADD CONSTRAINT "profile_endorsements_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_endorsements" ADD CONSTRAINT "profile_endorsements_endorser_user_id_users_id_fk" FOREIGN KEY ("endorser_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_endorsements_person_trait" ON "profile_endorsements" USING btree ("target_user_id","endorser_user_id","trait");--> statement-breakpoint
CREATE INDEX "profile_endorsements_target" ON "profile_endorsements" USING btree ("target_user_id");