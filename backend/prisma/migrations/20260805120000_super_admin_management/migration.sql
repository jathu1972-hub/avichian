-- Super Admin management: username, permissions, isRoot, createdBy

ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "employee_id" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "is_root" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

-- Backfill unique usernames from user reg_no + short admin id suffix when needed
UPDATE "admins" a
SET "username" = lower(regexp_replace(u.reg_no, '[^a-zA-Z0-9]', '', 'g'))
FROM "users" u
WHERE a.user_id = u.id AND (a.username IS NULL OR a.username = '');

UPDATE "admins"
SET "username" = 'admin_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE username IS NULL OR username = '';

-- Deduplicate usernames by appending id fragment
UPDATE "admins" a
SET "username" = a.username || '_' || substr(replace(a.id::text, '-', ''), 1, 6)
WHERE EXISTS (
  SELECT 1 FROM "admins" b
  WHERE lower(b.username) = lower(a.username) AND b.id < a.id
);

ALTER TABLE "admins" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "admins_username_key" ON "admins"("username");
CREATE INDEX IF NOT EXISTS "admins_is_root_idx" ON "admins"("is_root");
CREATE INDEX IF NOT EXISTS "admins_created_by_id_idx" ON "admins"("created_by_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admins_created_by_id_fkey'
  ) THEN
    ALTER TABLE "admins"
      ADD CONSTRAINT "admins_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Promote oldest super admin as root if none marked
UPDATE "admins"
SET "is_root" = true
WHERE id = (
  SELECT a.id FROM "admins" a
  INNER JOIN "users" u ON u.id = a.user_id
  WHERE u.role = 'SUPER_ADMIN' AND u.deleted_at IS NULL
  ORDER BY a.created_at ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM "admins" WHERE is_root = true);
