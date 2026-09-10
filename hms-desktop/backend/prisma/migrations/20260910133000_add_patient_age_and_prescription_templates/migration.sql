-- Store the age entered during registration instead of deriving it for every response.
ALTER TABLE "patients" ADD COLUMN "age" INTEGER;

UPDATE "patients"
SET "age" = GREATEST(
  0,
  DATE_PART('year', AGE(CURRENT_DATE, "date_of_birth"))::INTEGER
)
WHERE "age" IS NULL;

ALTER TABLE "patients" ALTER COLUMN "age" SET NOT NULL;

CREATE TABLE "prescription_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template_data" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "prescription_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prescription_templates_created_by_name_key"
ON "prescription_templates"("created_by", "name");

CREATE INDEX "prescription_templates_created_by_is_active_idx"
ON "prescription_templates"("created_by", "is_active");

ALTER TABLE "prescription_templates"
ADD CONSTRAINT "prescription_templates_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
