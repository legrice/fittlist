-- Seed the shared studio directory with Jersey City gyms & studios.
-- Idempotent: skips any name that already exists (case-insensitive).
INSERT INTO "studios" ("name","address") SELECT 'Ironbound Performance Athletics','334 2nd Street, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Ironbound Performance Athletics'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'JCFit (Downtown)','109 Christopher Columbus Dr, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('JCFit (Downtown)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'JCFit (Journal Square)','2815 John F. Kennedy Blvd, Jersey City, NJ 07306' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('JCFit (Journal Square)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Chilltown Fitness','517 Communipaw Ave, Jersey City, NJ 07304' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Chilltown Fitness'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Four Fitness','667 Montgomery St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Four Fitness'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Maximum Motion Fitness','262 Grove St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Maximum Motion Fitness'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Micro Gym Studios','189 Brunswick St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Micro Gym Studios'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Planet Fitness (Stadium Plaza)','321 Route 440, Jersey City, NJ 07305' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Planet Fitness (Stadium Plaza)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Blink Fitness (Journal Square)','35 Journal Square, Jersey City, NJ 07306' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Blink Fitness (Journal Square)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Retro Fitness','701 Route 440, Jersey City, NJ 07304' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Retro Fitness'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'F45 Training (Exchange Place)','65 Bay St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('F45 Training (Exchange Place)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Orangetheory Fitness (Newport)','475 Washington Blvd, Jersey City, NJ 07310' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Orangetheory Fitness (Newport)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'CKO Kickboxing','150 Bay St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('CKO Kickboxing'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Powerflow Yoga','160 Morgan St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Powerflow Yoga'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Sol Spirit Yoga & Wellness','523 Palisade Ave, Jersey City, NJ 07307' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Sol Spirit Yoga & Wellness'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Club Pilates (Powerhouse Arts)','171 Morgan St, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Club Pilates (Powerhouse Arts)'));
--> statement-breakpoint
INSERT INTO "studios" ("name","address") SELECT 'Project Pilates','231 Pavonia Ave, Jersey City, NJ 07302' WHERE NOT EXISTS (SELECT 1 FROM "studios" WHERE lower("name")=lower('Project Pilates'));
