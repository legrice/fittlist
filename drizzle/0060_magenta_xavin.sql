ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "coach_user_id" uuid;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN IF NOT EXISTS "account_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "classes" ADD CONSTRAINT "classes_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studios" ADD CONSTRAINT "studios_account_user_id_users_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
