ALTER TABLE "test_runs" ADD COLUMN "ci_url" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "commit_sha" text;