DROP TABLE "async-word-jobs";--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "stages" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
DROP TYPE "word_job_stage";