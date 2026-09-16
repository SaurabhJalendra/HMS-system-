-- Allow one phone number to be shared by multiple patients (families, shared contact numbers).
-- The unique constraint is replaced by a plain index so phone lookups stay fast.
DROP INDEX IF EXISTS "patients_phone_key";

CREATE INDEX IF NOT EXISTS "patients_phone_idx" ON "patients"("phone");
