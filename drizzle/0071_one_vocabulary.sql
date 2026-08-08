-- One vocabulary: the class picker and the studio/discipline picker are the
-- same list now, so the words that only ever lived in the class list have to
-- land somewhere in it. Left alone they would be orphans a coach could never
-- pick again, and Discover would draw a "Cycle" chip beside a "Cycling" one,
-- which is two chips for one idea and exactly the drift one vocabulary exists
-- to prevent. Two are pure synonyms and rename. "Other" drops to null instead,
-- because the picker already offers "No type" and a category meaning "none of
-- these" said twice is one too many. "Conditioning" needed no migration: it
-- joined the shared list, since a gym can be a conditioning gym as easily as a
-- class can be a conditioning class. Every table that stores a class's type
-- gets the same treatment, or a catalog pull puts the old word back.
UPDATE "classes" SET "class_type" = 'Cycling' WHERE "class_type" = 'Cycle';--> statement-breakpoint
UPDATE "classes" SET "class_type" = 'Run club' WHERE "class_type" = 'Run';--> statement-breakpoint
UPDATE "classes" SET "class_type" = NULL WHERE "class_type" = 'Other';--> statement-breakpoint
UPDATE "class_templates" SET "class_type" = 'Cycling' WHERE "class_type" = 'Cycle';--> statement-breakpoint
UPDATE "class_templates" SET "class_type" = 'Run club' WHERE "class_type" = 'Run';--> statement-breakpoint
UPDATE "class_templates" SET "class_type" = NULL WHERE "class_type" = 'Other';--> statement-breakpoint
UPDATE "studio_classes" SET "class_type" = 'Cycling' WHERE "class_type" = 'Cycle';--> statement-breakpoint
UPDATE "studio_classes" SET "class_type" = 'Run club' WHERE "class_type" = 'Run';--> statement-breakpoint
UPDATE "studio_classes" SET "class_type" = NULL WHERE "class_type" = 'Other';--> statement-breakpoint
UPDATE "personal_classes" SET "class_type" = 'Cycling' WHERE "class_type" = 'Cycle';--> statement-breakpoint
UPDATE "personal_classes" SET "class_type" = 'Run club' WHERE "class_type" = 'Run';--> statement-breakpoint
UPDATE "personal_classes" SET "class_type" = NULL WHERE "class_type" = 'Other';
