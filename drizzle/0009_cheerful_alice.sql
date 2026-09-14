CREATE TABLE "upload_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"upload_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
