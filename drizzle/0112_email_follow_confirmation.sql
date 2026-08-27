CREATE TABLE "email_follow_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_follow_confirmations_token_hash_check" CHECK (length("email_follow_confirmations"."token_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "email_follow_confirmations" ADD CONSTRAINT "email_follow_confirmations_trainer_user_id_users_id_fk" FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_follow_confirmations_token_hash" ON "email_follow_confirmations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_follow_confirmations_subject" ON "email_follow_confirmations" USING btree ("trainer_user_id","email","created_at");--> statement-breakpoint
CREATE INDEX "email_follow_confirmations_expiry" ON "email_follow_confirmations" USING btree ("expires_at");--> statement-breakpoint
-- Legacy public email follows were activated without proving mailbox control.
-- Keep account-backed follows, but require every email-only follower to opt in
-- again through the confirmation flow before another digest can be sent.
UPDATE "subscribers"
SET "opted_out_at" = now()
WHERE "user_id" IS NULL AND "opted_out_at" IS NULL;
