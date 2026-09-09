CREATE TABLE "defect_test_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"defect_id" text NOT NULL,
	"case_id" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "defects" ADD COLUMN "retests" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "defect_test_cases" ADD CONSTRAINT "defect_test_cases_defect_id_defects_id_fk" FOREIGN KEY ("defect_id") REFERENCES "public"."defects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect_test_cases" ADD CONSTRAINT "defect_test_cases_case_id_test_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;