-- Create enum for unified category moderation status.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CategoryStatus') THEN
    CREATE TYPE "CategoryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- Ensure notification enum has category moderation events.
DO $$
BEGIN
  BEGIN
    ALTER TYPE "NotificationType" ADD VALUE 'CATEGORY_APPROVED';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TYPE "NotificationType" ADD VALUE 'CATEGORY_REJECTED';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE "GlobalCategory"
  ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "orderIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "parent_id" TEXT,
  ADD COLUMN IF NOT EXISTS "proposedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "proposedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "status" "CategoryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "visualSearchSlug" TEXT;

-- Convert legacy boolean moderation flags into enum status.
DO $$
DECLARE
  has_validated BOOLEAN;
  has_rejected BOOLEAN;
  has_active BOOLEAN;
  validated_expr TEXT;
  rejected_expr TEXT;
  active_expr TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'GlobalCategory' AND column_name = 'isValidated'
  ) INTO has_validated;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'GlobalCategory' AND column_name = 'isRejected'
  ) INTO has_rejected;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'GlobalCategory' AND column_name = 'isActive'
  ) INTO has_active;

  IF has_validated OR has_rejected OR has_active THEN
    validated_expr := CASE WHEN has_validated THEN 'COALESCE("isValidated", FALSE)' ELSE 'FALSE' END;
    rejected_expr := CASE WHEN has_rejected THEN 'COALESCE("isRejected", FALSE)' ELSE 'FALSE' END;
    active_expr := CASE WHEN has_active THEN 'COALESCE("isActive", TRUE)' ELSE 'TRUE' END;

    EXECUTE format(
      'UPDATE "GlobalCategory" SET "status" = CASE WHEN %s THEN ''REJECTED''::"CategoryStatus" WHEN %s AND %s THEN ''APPROVED''::"CategoryStatus" ELSE ''APPROVED''::"CategoryStatus" END',
      rejected_expr,
      validated_expr,
      active_expr
    );
  ELSE
    UPDATE "GlobalCategory"
    SET "status" = 'APPROVED'::"CategoryStatus"
    WHERE "status" = 'PENDING'::"CategoryStatus" AND "proposedBy" IS NULL;
  END IF;
END $$;

-- Keep visualSearchSlug unique by nulling duplicate values first.
WITH duplicates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "visualSearchSlug" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "GlobalCategory"
  WHERE "visualSearchSlug" IS NOT NULL
)
UPDATE "GlobalCategory" category
SET "visualSearchSlug" = NULL
FROM duplicates
WHERE category."id" = duplicates."id" AND duplicates.rn > 1;

DROP INDEX IF EXISTS "GlobalCategory_isActive_idx";
DROP INDEX IF EXISTS "GlobalCategory_isValidated_isRejected_idx";

ALTER TABLE "GlobalCategory"
  DROP COLUMN IF EXISTS "isActive",
  DROP COLUMN IF EXISTS "isRejected",
  DROP COLUMN IF EXISTS "isValidated";

ALTER TABLE "PortfolioItem"
  ADD COLUMN IF NOT EXISTS "categorySource" TEXT,
  ADD COLUMN IF NOT EXISTS "global_category_id" TEXT,
  ADD COLUMN IF NOT EXISTS "inSearch" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "GlobalCategory_visualSearchSlug_key"
  ON "GlobalCategory"("visualSearchSlug");

CREATE INDEX IF NOT EXISTS "GlobalCategory_status_idx"
  ON "GlobalCategory"("status");

CREATE INDEX IF NOT EXISTS "GlobalCategory_parent_id_orderIndex_idx"
  ON "GlobalCategory"("parent_id", "orderIndex");

CREATE INDEX IF NOT EXISTS "GlobalCategory_isSystem_idx"
  ON "GlobalCategory"("isSystem");

CREATE INDEX IF NOT EXISTS "PortfolioItem_global_category_id_inSearch_idx"
  ON "PortfolioItem"("global_category_id", "inSearch");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GlobalCategory_parent_id_fkey'
  ) THEN
    ALTER TABLE "GlobalCategory"
      ADD CONSTRAINT "GlobalCategory_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "GlobalCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PortfolioItem_global_category_id_fkey'
  ) THEN
    ALTER TABLE "PortfolioItem"
      ADD CONSTRAINT "PortfolioItem_global_category_id_fkey"
      FOREIGN KEY ("global_category_id") REFERENCES "GlobalCategory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
