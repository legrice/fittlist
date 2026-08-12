CREATE TABLE "shoutouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"target_studio_id" uuid,
	"body" text NOT NULL,
	"featured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_target_studio_id_studios_id_fk" FOREIGN KEY ("target_studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shoutouts_target_user" ON "shoutouts" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "shoutouts_target_studio" ON "shoutouts" USING btree ("target_studio_id","created_at");