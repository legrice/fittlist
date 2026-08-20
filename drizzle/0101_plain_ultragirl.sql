ALTER TABLE "studios" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "studios" ADD CONSTRAINT "studios_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "studios" AS "studio"
SET "owner_user_id" = (
  SELECT "manager"."user_id"
  FROM "studio_managers" AS "manager"
  WHERE "manager"."studio_id" = "studio"."id"
  ORDER BY "manager"."created_at" ASC, "manager"."id" ASC
  LIMIT 1
)
WHERE "studio"."owner_user_id" IS NULL;
