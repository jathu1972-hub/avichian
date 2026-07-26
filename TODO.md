# Avichian — TODO

## Phase 1: Identity & Auth ✅ (MVP scaffold complete — awaiting your review)

- [x] Monorepo scaffold
- [x] Prisma schema (Phase 1 tables)
- [x] Registration against `student_master`
- [x] OTP verification (SMS console provider for dev)
- [x] JWT access + refresh token rotation
- [x] Login (password + OTP)
- [x] Forgot / reset password
- [x] RBAC + department scoping middleware
- [x] Account lockout
- [x] MFA for HOD/Super Admin
- [x] Admin student-master import endpoint
- [x] Auth API tests
- [x] GitHub Actions CI
- [x] Frontend auth UI (register, login, forgot password)
- [ ] Profile photo upload to R2 (deferred to Phase 2 file upload)
- [ ] Production SMS provider integration (Twilio)
- [ ] Production SMTP for email OTP
- [ ] Super Admin bootstrap script
- [ ] Capacitor mobile wrapper

## Phase 2: Social Core (blocked — confirm Phase 1 first)

- [ ] Home feed
- [ ] Stories
- [ ] Friends/follows
- [ ] Search
- [ ] Content moderation

## Phase 3: Real-Time Communication

- [ ] Socket.IO chat
- [ ] WebRTC calls
- [ ] Push notifications

## Phase 4: Campus Utility

- [ ] Events & calendar
- [ ] Communities
- [ ] Notifications center

## Phase 5: Admin & Compliance

- [ ] Admin dashboard
- [ ] HOD dashboard
- [ ] Analytics
- [ ] Data export/delete