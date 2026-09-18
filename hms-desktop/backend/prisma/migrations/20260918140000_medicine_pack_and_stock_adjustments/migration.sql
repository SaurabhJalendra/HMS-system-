ALTER TABLE "medicine_catalog" ADD COLUMN IF NOT EXISTS "tablets_per_strip" INTEGER;

ALTER TABLE "medicine_transactions" ALTER COLUMN "prescription_id" DROP NOT NULL;
ALTER TABLE "medicine_transactions" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "medicine_transactions" ADD COLUMN IF NOT EXISTS "adjustment_type" TEXT;
