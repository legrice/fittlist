ALTER TABLE "studio_classes" ADD COLUMN "studio_planner_color" text;--> statement-breakpoint
UPDATE "studio_classes" AS "catalog"
SET "studio_planner_color" = "existing"."studio_planner_color"
FROM (
  SELECT
    "studio_id",
    lower(trim("name")) AS "name_key",
    min("studio_planner_color") AS "studio_planner_color"
  FROM "classes"
  WHERE "studio_planner_color" IS NOT NULL
  GROUP BY "studio_id", lower(trim("name"))
) AS "existing"
WHERE "catalog"."studio_id" = "existing"."studio_id"
  AND "catalog"."name_key" = "existing"."name_key";--> statement-breakpoint
UPDATE "classes" AS "class"
SET "studio_planner_color" = "catalog"."studio_planner_color"
FROM "studio_classes" AS "catalog", "studios" AS "studio"
WHERE "catalog"."studio_id" = "studio"."id"
  AND "class"."studio_id" = "studio"."id"
  AND "class"."user_id" = "studio"."account_user_id"
  AND lower(trim("class"."name")) = "catalog"."name_key";
