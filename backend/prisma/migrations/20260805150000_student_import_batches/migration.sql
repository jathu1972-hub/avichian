-- Bulk student import history

DO $$ BEGIN
  ALTER TYPE "AuditAction" ADD VALUE 'BULK_STUDENT_IMPORT';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT;

CREATE TABLE IF NOT EXISTS "student_import_batches" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "section" TEXT,
    "initial_password_set" BOOLEAN NOT NULL DEFAULT true,
    "total_rows" INTEGER NOT NULL,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "error_report" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_import_batches_created_by_id_idx" ON "student_import_batches"("created_by_id");
CREATE INDEX IF NOT EXISTS "student_import_batches_department_id_idx" ON "student_import_batches"("department_id");
CREATE INDEX IF NOT EXISTS "student_import_batches_created_at_idx" ON "student_import_batches"("created_at");
CREATE INDEX IF NOT EXISTS "users_import_batch_id_idx" ON "users"("import_batch_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_import_batches_created_by_id_fkey') THEN
    ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_import_batches_department_id_fkey') THEN
    ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_department_id_fkey"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_import_batch_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_import_batch_id_fkey"
      FOREIGN KEY ("import_batch_id") REFERENCES "student_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
