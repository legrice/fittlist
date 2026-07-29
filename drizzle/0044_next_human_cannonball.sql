ALTER TABLE "users" ADD COLUMN "invite_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_unique" UNIQUE("invite_code");