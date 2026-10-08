CREATE TABLE "upload_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_key" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "upload_chunks_key_index_unique" ON "upload_chunks" USING btree ("upload_key","chunk_index");