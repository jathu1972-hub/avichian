-- Minimal local DB patches for schema drift (safe additive only)
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
CREATE INDEX IF NOT EXISTS "profiles_nickname_idx" ON "profiles"("nickname");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "import_batch_id" TEXT;
CREATE INDEX IF NOT EXISTS "users_import_batch_id_idx" ON "users"("import_batch_id");

ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "conversation_members_user_id_hidden_at_idx"
  ON "conversation_members"("user_id", "hidden_at");

-- admins.username if missing (nullable first, then backfill)
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "username" TEXT;
UPDATE "admins" SET "username" = COALESCE("username", 'admin_' || LEFT("id"::text, 8)) WHERE "username" IS NULL;
