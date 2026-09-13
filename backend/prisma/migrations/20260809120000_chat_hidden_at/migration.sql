-- User-specific conversation hide (delete chat for me)
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "hidden_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "conversation_members_user_id_hidden_at_idx"
  ON "conversation_members"("user_id", "hidden_at");
