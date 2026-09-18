ALTER TABLE "bills"
ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP(3);

UPDATE "bills"
SET "paid_amount" = "total_amount",
    "paid_at" = "created_at"
WHERE "payment_status" = 'PAID'
  AND "paid_amount" IS NULL;
