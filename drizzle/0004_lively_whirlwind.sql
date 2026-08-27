ALTER TABLE "projects" ADD COLUMN "status" text DEFAULT 'backlog' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;