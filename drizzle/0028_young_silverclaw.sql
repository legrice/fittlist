ALTER TABLE "subscribers" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kind" text DEFAULT 'coach' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;