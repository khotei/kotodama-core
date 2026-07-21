-- Retire the word_status_counts tally: unfiltered `/counts` now aggregates `words` live, like the
-- filtered path. The trigger hangs off `words` (not the counts table), so it must be dropped
-- explicitly before its function; the table drop then stands alone. Hand-authored — drizzle-kit
-- only emitted the DROP TABLE (the trigger/function were never in its snapshot).
DROP TRIGGER "words_status_counts_sync_trg" ON "words";--> statement-breakpoint
DROP FUNCTION "words_status_counts_sync";--> statement-breakpoint
DROP TABLE "word_status_counts";
