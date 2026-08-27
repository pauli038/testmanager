CREATE TABLE "case_kanban_columns" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "case_kanban_columns" ADD CONSTRAINT "case_kanban_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "progress";