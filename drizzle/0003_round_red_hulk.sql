ALTER TABLE "defects" ADD COLUMN "case_id" text;--> statement-breakpoint
ALTER TABLE "defects" ADD COLUMN "steps_to_reproduce" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "defects" ADD COLUMN "module" text;--> statement-breakpoint
ALTER TABLE "defects" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "defects" ADD COLUMN "detected_at" text;--> statement-breakpoint
ALTER TABLE "defects" ADD CONSTRAINT "defects_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE set null ON UPDATE no action;