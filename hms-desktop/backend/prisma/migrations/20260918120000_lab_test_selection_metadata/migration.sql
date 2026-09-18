ALTER TABLE "technician_test_selections"
ADD COLUMN IF NOT EXISTS "selected_datapoints" JSONB,
ADD COLUMN IF NOT EXISTS "custom_price" DECIMAL(10, 2);
