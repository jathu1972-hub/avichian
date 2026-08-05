-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'STAFF', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTRATION', 'LOGIN', 'PASSWORD_RESET', 'MFA');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "LoginMethod" AS ENUM ('PASSWORD', 'OTP', 'MFA');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'REGISTRATION', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'ACCOUNT_LOCKED', 'MFA_ENABLED', 'MFA_VERIFIED', 'STUDENT_MASTER_IMPORT', 'SESSION_REFRESH', 'SESSION_REVOKED', 'USER_CREATED', 'USER_UPDATED', 'USER_SUSPENDED', 'USER_ACTIVATED', 'USER_DELETED', 'CONTENT_DELETED', 'CONTENT_RESTORED', 'REPORT_REVIEWED', 'REPORT_CLOSED', 'ANNOUNCEMENT_PUBLISHED', 'EVENT_PUBLISHED', 'USER_WARNED', 'CONTENT_ARCHIVED', 'CONTENT_REPORTED');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'BULLYING', 'VIOLENCE', 'FAKE_ACCOUNT', 'ADULT_CONTENT', 'ILLEGAL_CONTENT', 'SCAM', 'INAPPROPRIATE', 'HATE_SPEECH', 'THREATS', 'NUDITY', 'CHILD_SAFETY', 'COPYRIGHT', 'MISINFORMATION', 'IMPERSONATION', 'SELF_HARM', 'TERRORISM', 'INAPPROPRIATE_LANGUAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'ACTIONED', 'CLOSED', 'REJECTED', 'APPEALED');

-- CreateEnum
CREATE TYPE "ContentReportTarget" AS ENUM ('POST', 'STORY', 'MESSAGE', 'USER', 'COMMENT', 'REEL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "PostVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FriendRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'PDF', 'VOICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'MISSED', 'REJECTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'POST_LIKE', 'COMMENT', 'CALL_MISSED', 'CALL_INCOMING', 'EVENT', 'ANNOUNCEMENT', 'MESSAGE');

-- CreateEnum
CREATE TYPE "StudentMasterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProfilePrivacy" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('COLLEGE', 'DEPARTMENT', 'CLUBS', 'WORKSHOPS', 'SPORTS', 'CULTURAL', 'SEMINARS', 'COMPETITIONS', 'EXAMS', 'HOLIDAYS', 'OTHER');

-- CreateEnum
CREATE TYPE "CampusEventStatus" AS ENUM ('DRAFT', 'UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('ALL_STUDENTS', 'DEPARTMENT_ONLY');

-- CreateEnum
CREATE TYPE "PersonalEventType" AS ENUM ('REMINDER', 'ASSIGNMENT', 'MEETING', 'PROJECT', 'BIRTHDAY', 'PRACTICE', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityCategory" AS ENUM ('CLUB', 'SPORTS', 'CULTURAL', 'ACADEMIC', 'DEPARTMENT', 'OFFICIAL', 'HOBBY', 'TECH', 'OTHER');

-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CommunityAccess" AS ENUM ('OPEN', 'REQUEST', 'INVITE');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CommunityMemberRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "StoryMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "StoryVisibility" AS ENUM ('PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('TECHNICAL', 'LOGIN', 'BUG', 'STAFF', 'CAMPUS', 'COMMUNITY', 'EVENT', 'FEATURE', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'DISMISSED');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campus_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "EventCategory" NOT NULL DEFAULT 'COLLEGE',
    "department_id" TEXT,
    "venue" TEXT,
    "banner_url" TEXT,
    "organizer" TEXT,
    "speaker" TEXT,
    "capacity" INTEGER,
    "registered_count" INTEGER NOT NULL DEFAULT 0,
    "interested_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "registration_deadline" TIMESTAMP(3),
    "visibility" "EventVisibility" NOT NULL DEFAULT 'ALL_STUDENTS',
    "status" "CampusEventStatus" NOT NULL DEFAULT 'UPCOMING',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "gallery" JSONB,
    "schedule" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campus_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_interests" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "interested" BOOLEAN NOT NULL DEFAULT true,
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "CommunityCategory" NOT NULL DEFAULT 'CLUB',
    "department_id" TEXT,
    "banner_url" TEXT,
    "icon_url" TEXT,
    "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC',
    "accessType" "CommunityAccess" NOT NULL DEFAULT 'OPEN',
    "status" "CommunityStatus" NOT NULL DEFAULT 'ACTIVE',
    "rules" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "chat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_members" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "CommunityMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "community_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "media_url" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "PersonalEventType" NOT NULL DEFAULT 'REMINDER',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "reminder_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'DEPARTMENT',
    "year" INTEGER,
    "section" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_events" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "venue" TEXT,
    "max_participants" INTEGER,
    "registration_deadline" TIMESTAMP(3),
    "visibility" TEXT NOT NULL DEFAULT 'DEPARTMENT',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "banner_url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_master" (
    "id" TEXT NOT NULL,
    "reg_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile_hash" TEXT NOT NULL,
    "mobile_enc" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "section" TEXT,
    "status" "StudentMasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "account_created" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "reg_no" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile_hash" TEXT NOT NULL,
    "mobile_enc" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "department_id" TEXT NOT NULL,
    "student_master_id" TEXT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_failed_login_at" TIMESTAMP(3),
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_enc" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "force_password_change" BOOLEAN NOT NULL DEFAULT false,
    "verified_badge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "private_account" BOOLEAN NOT NULL DEFAULT false,
    "who_can_message" TEXT NOT NULL DEFAULT 'FRIENDS',
    "who_can_call" TEXT NOT NULL DEFAULT 'FRIENDS',
    "who_can_see_posts" TEXT NOT NULL DEFAULT 'PUBLIC',
    "who_can_see_stories" TEXT NOT NULL DEFAULT 'DEPARTMENT',
    "who_can_see_profile" TEXT NOT NULL DEFAULT 'PUBLIC',
    "notify_likes" BOOLEAN NOT NULL DEFAULT true,
    "notify_comments" BOOLEAN NOT NULL DEFAULT true,
    "notify_friend_requests" BOOLEAN NOT NULL DEFAULT true,
    "notify_messages" BOOLEAN NOT NULL DEFAULT true,
    "notify_calls" BOOLEAN NOT NULL DEFAULT true,
    "notify_events" BOOLEAN NOT NULL DEFAULT true,
    "notify_communities" BOOLEAN NOT NULL DEFAULT true,
    "notify_announcements" BOOLEAN NOT NULL DEFAULT true,
    "notify_reminders" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "accent_color" TEXT NOT NULL DEFAULT 'blue',
    "font_scale" TEXT NOT NULL DEFAULT 'medium',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "year" INTEGER,
    "section" TEXT,
    "profile_photo_url" TEXT,
    "cover_photo_url" TEXT,
    "privacy" "ProfilePrivacy" NOT NULL DEFAULT 'PUBLIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_url" TEXT NOT NULL,
    "storage_backend" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "title" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "refresh_token_lookup" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "device_label" TEXT,
    "remember_me" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "reg_no" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "code_hash" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "reg_no" TEXT,
    "method" "LoginMethod" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_logs" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "reset_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "caption" TEXT,
    "media_url" TEXT,
    "media_mime_type" TEXT,
    "visibility" "PostVisibility" NOT NULL DEFAULT 'DEPARTMENT',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "media_type" "StoryMediaType" NOT NULL DEFAULT 'IMAGE',
    "media_mime_type" TEXT,
    "caption" TEXT,
    "visibility" "StoryVisibility" NOT NULL DEFAULT 'DEPARTMENT',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_views" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "viewer_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_url" TEXT NOT NULL,
    "media_mime_type" TEXT,
    "cover_url" TEXT,
    "audio_name" TEXT,
    "duration_sec" INTEGER,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "visibility" "PostVisibility" NOT NULL DEFAULT 'DEPARTMENT',
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_likes" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_comments" (
    "id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parent_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reel_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_comment_likes" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_reels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reel_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_hides" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_hides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friend_requests" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "status" "FriendRequestStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "media_url" TEXT,
    "file_name" TEXT,
    "reply_to_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "seen_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_history" (
    "id" TEXT NOT NULL,
    "caller_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "room_name" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "call_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "target_type" "ContentReportTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_user_id" TEXT,
    "reason" "ContentReportReason" NOT NULL,
    "details" TEXT,
    "evidence_url" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mutes" (
    "id" TEXT NOT NULL,
    "muter_id" TEXT NOT NULL,
    "muted_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attachment_url" TEXT,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_admin_id" TEXT,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" TEXT NOT NULL,
    "report_id" TEXT,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "campus_events_starts_at_idx" ON "campus_events"("starts_at");

-- CreateIndex
CREATE INDEX "campus_events_status_idx" ON "campus_events"("status");

-- CreateIndex
CREATE INDEX "campus_events_category_idx" ON "campus_events"("category");

-- CreateIndex
CREATE INDEX "campus_events_department_id_idx" ON "campus_events"("department_id");

-- CreateIndex
CREATE INDEX "campus_events_published_status_idx" ON "campus_events"("published", "status");

-- CreateIndex
CREATE INDEX "event_participants_user_id_idx" ON "event_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_id_user_id_key" ON "event_participants"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_interests_user_id_idx" ON "event_interests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_interests_event_id_user_id_key" ON "event_interests"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_status_category_idx" ON "communities"("status", "category");

-- CreateIndex
CREATE INDEX "communities_department_id_idx" ON "communities"("department_id");

-- CreateIndex
CREATE INDEX "communities_created_at_idx" ON "communities"("created_at");

-- CreateIndex
CREATE INDEX "communities_featured_idx" ON "communities"("featured");

-- CreateIndex
CREATE INDEX "community_members_user_id_idx" ON "community_members"("user_id");

-- CreateIndex
CREATE INDEX "community_members_community_id_role_idx" ON "community_members"("community_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "community_members_community_id_user_id_key" ON "community_members"("community_id", "user_id");

-- CreateIndex
CREATE INDEX "community_posts_community_id_created_at_idx" ON "community_posts"("community_id", "created_at");

-- CreateIndex
CREATE INDEX "community_posts_user_id_idx" ON "community_posts"("user_id");

-- CreateIndex
CREATE INDEX "personal_events_user_id_starts_at_idx" ON "personal_events"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "personal_events_reminder_at_idx" ON "personal_events"("reminder_at");

-- CreateIndex
CREATE INDEX "announcements_department_id_idx" ON "announcements"("department_id");

-- CreateIndex
CREATE INDEX "announcements_created_at_idx" ON "announcements"("created_at");

-- CreateIndex
CREATE INDEX "department_events_department_id_idx" ON "department_events"("department_id");

-- CreateIndex
CREATE INDEX "department_events_starts_at_idx" ON "department_events"("starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_master_reg_no_key" ON "student_master"("reg_no");

-- CreateIndex
CREATE INDEX "student_master_department_id_idx" ON "student_master"("department_id");

-- CreateIndex
CREATE INDEX "student_master_email_idx" ON "student_master"("email");

-- CreateIndex
CREATE INDEX "student_master_mobile_hash_idx" ON "student_master"("mobile_hash");

-- CreateIndex
CREATE INDEX "student_master_status_idx" ON "student_master"("status");

-- CreateIndex
CREATE INDEX "student_master_account_created_idx" ON "student_master"("account_created");

-- CreateIndex
CREATE UNIQUE INDEX "users_reg_no_key" ON "users"("reg_no");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_hash_key" ON "users"("mobile_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_master_id_key" ON "users"("student_master_id");

-- CreateIndex
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "media_assets_user_id_created_at_idx" ON "media_assets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "media_assets_purpose_idx" ON "media_assets"("purpose");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_staff_id_key" ON "staff"("staff_id");

-- CreateIndex
CREATE INDEX "staff_department_id_idx" ON "staff"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_user_id_key" ON "admins"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_lookup_key" ON "sessions"("refresh_token_lookup");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "otp_codes_reg_no_idx" ON "otp_codes"("reg_no");

-- CreateIndex
CREATE INDEX "otp_codes_mobile_idx" ON "otp_codes"("mobile");

-- CreateIndex
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");

-- CreateIndex
CREATE INDEX "login_history_user_id_idx" ON "login_history"("user_id");

-- CreateIndex
CREATE INDEX "login_history_created_at_idx" ON "login_history"("created_at");

-- CreateIndex
CREATE INDEX "password_reset_logs_student_id_created_at_idx" ON "password_reset_logs"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "password_reset_logs_admin_id_created_at_idx" ON "password_reset_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "posts_visibility_idx" ON "posts"("visibility");

-- CreateIndex
CREATE INDEX "posts_is_deleted_idx" ON "posts"("is_deleted");

-- CreateIndex
CREATE INDEX "post_likes_user_id_idx" ON "post_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "stories_user_id_idx" ON "stories"("user_id");

-- CreateIndex
CREATE INDEX "stories_expires_at_idx" ON "stories"("expires_at");

-- CreateIndex
CREATE INDEX "stories_created_at_idx" ON "stories"("created_at");

-- CreateIndex
CREATE INDEX "stories_visibility_idx" ON "stories"("visibility");

-- CreateIndex
CREATE INDEX "stories_is_deleted_idx" ON "stories"("is_deleted");

-- CreateIndex
CREATE INDEX "story_views_story_id_viewed_at_idx" ON "story_views"("story_id", "viewed_at");

-- CreateIndex
CREATE INDEX "story_views_viewer_id_idx" ON "story_views"("viewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_views_story_id_viewer_id_key" ON "story_views"("story_id", "viewer_id");

-- CreateIndex
CREATE INDEX "reels_author_id_idx" ON "reels"("author_id");

-- CreateIndex
CREATE INDEX "reels_created_at_idx" ON "reels"("created_at");

-- CreateIndex
CREATE INDEX "reels_is_deleted_idx" ON "reels"("is_deleted");

-- CreateIndex
CREATE INDEX "reels_visibility_idx" ON "reels"("visibility");

-- CreateIndex
CREATE INDEX "reel_likes_user_id_idx" ON "reel_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reel_likes_reel_id_user_id_key" ON "reel_likes"("reel_id", "user_id");

-- CreateIndex
CREATE INDEX "reel_comments_reel_id_created_at_idx" ON "reel_comments"("reel_id", "created_at");

-- CreateIndex
CREATE INDEX "reel_comments_user_id_idx" ON "reel_comments"("user_id");

-- CreateIndex
CREATE INDEX "reel_comments_parent_id_idx" ON "reel_comments"("parent_id");

-- CreateIndex
CREATE INDEX "reel_comment_likes_user_id_idx" ON "reel_comment_likes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reel_comment_likes_comment_id_user_id_key" ON "reel_comment_likes"("comment_id", "user_id");

-- CreateIndex
CREATE INDEX "saved_reels_user_id_created_at_idx" ON "saved_reels"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_reels_user_id_reel_id_key" ON "saved_reels"("user_id", "reel_id");

-- CreateIndex
CREATE INDEX "content_hides_user_id_idx" ON "content_hides"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_hides_user_id_target_type_target_id_key" ON "content_hides"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "friend_requests_receiver_id_status_idx" ON "friend_requests"("receiver_id", "status");

-- CreateIndex
CREATE INDEX "friend_requests_sender_id_status_idx" ON "friend_requests"("sender_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friend_requests_sender_id_receiver_id_key" ON "friend_requests"("sender_id", "receiver_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key" ON "conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "call_history_caller_id_idx" ON "call_history"("caller_id");

-- CreateIndex
CREATE INDEX "call_history_receiver_id_idx" ON "call_history"("receiver_id");

-- CreateIndex
CREATE INDEX "call_history_started_at_idx" ON "call_history"("started_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "content_reports_status_created_at_idx" ON "content_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "content_reports_target_type_target_id_idx" ON "content_reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "content_reports_reporter_id_created_at_idx" ON "content_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE INDEX "user_mutes_muted_id_idx" ON "user_mutes"("muted_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_mutes_muter_id_muted_id_key" ON "user_mutes"("muter_id", "muted_id");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_ticket_number_key" ON "complaints"("ticket_number");

-- CreateIndex
CREATE INDEX "complaints_user_id_created_at_idx" ON "complaints"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "complaints_status_priority_idx" ON "complaints"("status", "priority");

-- CreateIndex
CREATE INDEX "moderation_actions_report_id_idx" ON "moderation_actions"("report_id");

-- CreateIndex
CREATE INDEX "moderation_actions_admin_id_created_at_idx" ON "moderation_actions"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "campus_events" ADD CONSTRAINT "campus_events_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "campus_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interests" ADD CONSTRAINT "event_interests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "campus_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_interests" ADD CONSTRAINT "event_interests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_events" ADD CONSTRAINT "personal_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_events" ADD CONSTRAINT "department_events_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_master" ADD CONSTRAINT "student_master_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_student_master_id_fkey" FOREIGN KEY ("student_master_id") REFERENCES "student_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_logs" ADD CONSTRAINT "password_reset_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_logs" ADD CONSTRAINT "password_reset_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_likes" ADD CONSTRAINT "reel_likes_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_likes" ADD CONSTRAINT "reel_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "reel_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comment_likes" ADD CONSTRAINT "reel_comment_likes_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "reel_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_comment_likes" ADD CONSTRAINT "reel_comment_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reels" ADD CONSTRAINT "saved_reels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_reels" ADD CONSTRAINT "saved_reels_reel_id_fkey" FOREIGN KEY ("reel_id") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_hides" ADD CONSTRAINT "content_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_history" ADD CONSTRAINT "call_history_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_muter_id_fkey" FOREIGN KEY ("muter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mutes" ADD CONSTRAINT "user_mutes_muted_id_fkey" FOREIGN KEY ("muted_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "content_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
