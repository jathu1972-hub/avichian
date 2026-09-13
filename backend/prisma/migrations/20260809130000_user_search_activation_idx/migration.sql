-- Composite index for activated-student search filters
CREATE INDEX IF NOT EXISTS "users_role_account_status_last_login_at_force_password_change_idx"
  ON "users"("role", "account_status", "last_login_at", "force_password_change");
