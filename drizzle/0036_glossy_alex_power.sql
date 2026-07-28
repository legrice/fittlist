DROP INDEX "inquiry_thread_coach_email";--> statement-breakpoint
ALTER TABLE "inquiry_threads" ADD COLUMN "kind" text DEFAULT 'inquiry' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_thread_coach_email" ON "inquiry_threads" USING btree ("coach_user_id","requester_email","kind");