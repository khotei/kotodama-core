CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"term" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text NOT NULL,
	"explanation" text,
	"literary_context" jsonb,
	"cultural_context" jsonb,
	"parts_of_speech" jsonb,
	"pronunciation" jsonb,
	"hero_image_key" text,
	"meme_image_key" text,
	"source_versions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	CONSTRAINT "words_term_locale_unique" UNIQUE("term","locale")
);
--> statement-breakpoint
CREATE INDEX "words_status_index" ON "words" ("status");