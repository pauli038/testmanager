CREATE TABLE "test_plan_suites" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"suite_id" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_plan_suites" ADD CONSTRAINT "test_plan_suites_plan_id_test_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."test_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_plan_suites" ADD CONSTRAINT "test_plan_suites_suite_id_test_suites_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."test_suites"("id") ON DELETE cascade ON UPDATE no action;