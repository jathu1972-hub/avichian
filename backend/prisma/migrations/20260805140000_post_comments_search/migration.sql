-- Post comments + nickname + indexes for registered-user search

ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
CREATE INDEX IF NOT EXISTS "profiles_nickname_idx" ON "profiles"("nickname");

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "comment_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "post_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parent_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "post_comment_likes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_comment_likes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "post_comments_post_id_created_at_idx" ON "post_comments"("post_id", "created_at");
CREATE INDEX IF NOT EXISTS "post_comments_user_id_idx" ON "post_comments"("user_id");
CREATE INDEX IF NOT EXISTS "post_comments_parent_id_idx" ON "post_comments"("parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "post_comment_likes_comment_id_user_id_key" ON "post_comment_likes"("comment_id", "user_id");
CREATE INDEX IF NOT EXISTS "post_comment_likes_user_id_idx" ON "post_comment_likes"("user_id");
CREATE INDEX IF NOT EXISTS "users_last_login_at_idx" ON "users"("last_login_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_comments_post_id_fkey') THEN
    ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey"
      FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_comments_user_id_fkey') THEN
    ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_comments_parent_id_fkey') THEN
    ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey"
      FOREIGN KEY ("parent_id") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_comment_likes_comment_id_fkey') THEN
    ALTER TABLE "post_comment_likes" ADD CONSTRAINT "post_comment_likes_comment_id_fkey"
      FOREIGN KEY ("comment_id") REFERENCES "post_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_comment_likes_user_id_fkey') THEN
    ALTER TABLE "post_comment_likes" ADD CONSTRAINT "post_comment_likes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
