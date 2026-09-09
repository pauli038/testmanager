ALTER TABLE "defects" DROP CONSTRAINT "defects_case_id_test_cases_id_fk";
--> statement-breakpoint
INSERT INTO "defect_test_cases" ("id", "defect_id", "case_id", "created_at")
SELECT gen_random_uuid()::text, "id", "case_id", "created_at" FROM "defects" WHERE "case_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "defects" DROP COLUMN "case_id";