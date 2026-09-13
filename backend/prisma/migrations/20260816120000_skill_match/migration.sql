-- Skill Match
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SKILL_MATCH_REQUEST';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SKILL_MATCH_ACCEPTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SkillProficiency" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "SkillMatchVisibility" AS ENUM ('CAMPUS', 'CONNECTED', 'HIDDEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "SkillMatchRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "skill_categories" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "skills" (
  "id" TEXT PRIMARY KEY,
  "category_id" TEXT NOT NULL REFERENCES "skill_categories"("id") ON DELETE CASCADE,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("category_id", "slug")
);
CREATE INDEX IF NOT EXISTS "skills_category_id_idx" ON "skills"("category_id");
CREATE INDEX IF NOT EXISTS "skills_name_idx" ON "skills"("name");

CREATE TABLE IF NOT EXISTS "skill_match_profiles" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "visibility" "SkillMatchVisibility" NOT NULL DEFAULT 'CAMPUS',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "student_skills" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_id" TEXT NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "proficiency" "SkillProficiency" NOT NULL DEFAULT 'BEGINNER',
  UNIQUE ("user_id", "skill_id")
);
CREATE INDEX IF NOT EXISTS "student_skills_user_id_idx" ON "student_skills"("user_id");
CREATE INDEX IF NOT EXISTS "student_skills_skill_id_idx" ON "student_skills"("skill_id");

CREATE TABLE IF NOT EXISTS "skill_interests" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "skill_id" TEXT NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  UNIQUE ("user_id", "skill_id")
);
CREATE INDEX IF NOT EXISTS "skill_interests_user_id_idx" ON "skill_interests"("user_id");

CREATE TABLE IF NOT EXISTS "skill_goal_catalog" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "student_goals" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "goal_id" TEXT NOT NULL REFERENCES "skill_goal_catalog"("id") ON DELETE CASCADE,
  UNIQUE ("user_id", "goal_id")
);
CREATE INDEX IF NOT EXISTS "student_goals_user_id_idx" ON "student_goals"("user_id");

CREATE TABLE IF NOT EXISTS "skill_availability_catalog" (
  "id" TEXT PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "student_availabilities" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "avail_id" TEXT NOT NULL REFERENCES "skill_availability_catalog"("id") ON DELETE CASCADE,
  UNIQUE ("user_id", "avail_id")
);
CREATE INDEX IF NOT EXISTS "student_availabilities_user_id_idx" ON "student_availabilities"("user_id");

CREATE TABLE IF NOT EXISTS "skill_match_requests" (
  "id" TEXT PRIMARY KEY,
  "sender_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "receiver_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "SkillMatchRequestStatus" NOT NULL DEFAULT 'PENDING',
  "match_score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("sender_id", "receiver_id")
);
CREATE INDEX IF NOT EXISTS "skill_match_requests_receiver_id_status_idx" ON "skill_match_requests"("receiver_id", "status");
CREATE INDEX IF NOT EXISTS "skill_match_requests_sender_id_status_idx" ON "skill_match_requests"("sender_id", "status");
