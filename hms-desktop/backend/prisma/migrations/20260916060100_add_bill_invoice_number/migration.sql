-- bills.invoice_number is declared in schema.prisma but was never added by a migration,
-- so every bill insert failed on databases built from migrations.
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "invoice_number" TEXT;
