ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "employee_id" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "permissions" JSONB DEFAULT '{}'::jsonb;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "is_root" BOOLEAN DEFAULT false;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

UPDATE "admins" SET "username" = COALESCE(NULLIF("username", ''), 'admin_' || LEFT(replace("id"::text, '-', ''), 8))
WHERE "username" IS NULL OR "username" = '';

-- unique index if not exists
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "admins_username_key" ON "admins"("username");
EXCEPTION WHEN others THEN NULL;
END $$;
