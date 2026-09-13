-- Align local DB with Prisma User model fields that may be missing on older DBs
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT;
CREATE INDEX IF NOT EXISTS "users_import_batch_id_idx" ON "users"("import_batch_id");
CREATE INDEX IF NOT EXISTS "users_role_account_status_last_login_at_force_password_change_idx"
  ON "users"("role", "account_status", "last_login_at", "force_password_change");
