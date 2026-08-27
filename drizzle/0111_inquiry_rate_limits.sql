CREATE TABLE "anonymous_action_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"target_kind" text NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anonymous_action_rate_limits_scope_check" CHECK ("anonymous_action_rate_limits"."scope" IN ('ip', 'ip_target', 'subject_target', 'target')),
	CONSTRAINT "anonymous_action_rate_limits_hit_count_check" CHECK ("anonymous_action_rate_limits"."hit_count" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "anonymous_action_rate_limits_key" ON "anonymous_action_rate_limits" USING btree ("action","target_kind","scope","key_hash");--> statement-breakpoint
CREATE INDEX "anonymous_action_rate_limits_expiry" ON "anonymous_action_rate_limits" USING btree ("expires_at");--> statement-breakpoint
UPDATE "content_reports" AS "report"
SET "author_user_id" = NULL
WHERE "report"."content_type" = 'inquiry_message'
	AND NOT EXISTS (
		SELECT 1
		FROM "inquiry_messages" AS "message"
		INNER JOIN "inquiry_threads" AS "thread"
			ON "thread"."id" = "message"."thread_id"
		WHERE "message"."id" = "report"."content_id"
			AND "message"."from_coach" = true
			AND "thread"."coach_user_id" = "report"."author_user_id"
	);
