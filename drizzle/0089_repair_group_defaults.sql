UPDATE "groups" SET "visibility" = 'unlisted' WHERE "visibility" IS NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "visibility" SET DEFAULT 'unlisted';
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "visibility" SET NOT NULL;
--> statement-breakpoint
UPDATE "groups" SET "purpose" = 'plan' WHERE "purpose" IS NULL;
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "purpose" SET DEFAULT 'plan';
--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "purpose" SET NOT NULL;
--> statement-breakpoint
UPDATE "group_members" SET "role" = 'member' WHERE "role" IS NULL;
--> statement-breakpoint
ALTER TABLE "group_members" ALTER COLUMN "role" SET DEFAULT 'member';
--> statement-breakpoint
ALTER TABLE "group_members" ALTER COLUMN "role" SET NOT NULL;
