CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "async_job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "language" AS ENUM('ru', 'en', 'es', 'fr', 'de', 'zh', 'ja', 'hi', 'ar', 'uk');--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"word" text NOT NULL,
	"language" "language" DEFAULT 'en'::"language" NOT NULL,
	"status" "async_job_status" NOT NULL,
	"stages" jsonb DEFAULT '[]' NOT NULL,
	"core_definition" text,
	"lexical" jsonb,
	"pronunciation" jsonb,
	"tiers" jsonb,
	"etymology" jsonb,
	"author_examples" jsonb,
	"cultural_guide" jsonb,
	"relations" jsonb,
	"translations" jsonb,
	"visuals" jsonb,
	"sources" jsonb,
	"provenance" jsonb,
	"frequency" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "words_word_language_unique" UNIQUE("word","language"),
	CONSTRAINT "words_succeeded_content_present" CHECK ("status" <> 'succeeded' OR ("core_definition" IS NOT NULL AND "lexical" IS NOT NULL AND "pronunciation" IS NOT NULL AND "tiers" IS NOT NULL AND "etymology" IS NOT NULL AND "author_examples" IS NOT NULL AND "cultural_guide" IS NOT NULL AND "relations" IS NOT NULL AND "translations" IS NOT NULL AND "visuals" IS NOT NULL AND "sources" IS NOT NULL AND "provenance" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "words_language_created_at_word_idx" ON "words" ("language","created_at" DESC NULLS LAST,"word");--> statement-breakpoint
CREATE INDEX "words_language_status_created_at_word_idx" ON "words" ("language","status","created_at" DESC NULLS LAST,"word");--> statement-breakpoint
CREATE INDEX "words_language_pos_created_at_word_idx" ON "words" ("language",("lexical" ->> 'partOfSpeech'),"created_at" DESC NULLS LAST,"word") WHERE "lexical" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "words_word_core_definition_trgm_idx" ON "words" USING gin ("word" gin_trgm_ops,"core_definition" gin_trgm_ops);