-- Batch number is mandatory for catalog imports. It remains nullable at the
-- database level for legacy rows and non-import workflows that predate batches.
ALTER TABLE "medicine_catalog" ADD COLUMN IF NOT EXISTS "batch_number" TEXT;
