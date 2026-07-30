ALTER TABLE "inquiry_threads" ADD COLUMN "requester_unread" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_messages" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_cancellations" boolean DEFAULT true NOT NULL;