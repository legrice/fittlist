CREATE TABLE "inquiry_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"from_coach" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiry_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"requester_name" text DEFAULT '' NOT NULL,
	"requester_email" text NOT NULL,
	"coach_unread" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_messages" ADD CONSTRAINT "inquiry_messages_thread_id_inquiry_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."inquiry_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_threads" ADD CONSTRAINT "inquiry_threads_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inquiry_thread_coach_email" ON "inquiry_threads" USING btree ("coach_user_id","requester_email");