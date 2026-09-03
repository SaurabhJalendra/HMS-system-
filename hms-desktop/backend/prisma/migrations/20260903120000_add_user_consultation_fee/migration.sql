-- Per-doctor OPD consultation fee (nullable; hospital default is used when unset)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "consultation_fee" DECIMAL(10,2);
