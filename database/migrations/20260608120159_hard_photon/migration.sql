CREATE TYPE "async_job_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "language" AS ENUM('ru', 'en');--> statement-breakpoint
CREATE TYPE "word_job_stage" AS ENUM('fetch_source', 'enrich_etymology', 'enrich_tiers', 'enrich_authors', 'enrich_visuals', 'final_review');--> statement-breakpoint
CREATE TABLE "async-word-jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"word" text NOT NULL,
	"language" "language" DEFAULT 'en'::"language" NOT NULL,
	"stage" "word_job_stage" NOT NULL,
	"status" "async_job_status" DEFAULT 'pending'::"async_job_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "async_word_jobs_stage_uq" UNIQUE("word","language","stage")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"word" text NOT NULL,
	"language" "language" DEFAULT 'en'::"language" NOT NULL,
	"core_definition" text NOT NULL,
	"lexical" jsonb NOT NULL,
	"pronunciation" jsonb NOT NULL,
	"tiers" jsonb NOT NULL,
	"etymology" jsonb NOT NULL,
	"author_examples" jsonb DEFAULT '[]' NOT NULL,
	"cultural_guide" jsonb NOT NULL,
	"relations" jsonb NOT NULL,
	"translations" jsonb DEFAULT '[]' NOT NULL,
	"visuals" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"source_versions" jsonb NOT NULL,
	"frequency" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "words_word_language_unique" UNIQUE("word","language")
);
