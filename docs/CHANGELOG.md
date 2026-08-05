# Changelog

All notable changes to Avichian are documented here.

## [0.2.0] - 2026-07-09

### Added
- Student email OTP login (`/api/auth/login/otp/email/*`)
- Staff login (`/api/auth/login/staff`) with Staff ID + email + password
- Remember Me (30-day refresh token)
- Account status: ACTIVE, SUSPENDED, UNVERIFIED
- Department validation during student registration
- MFA setup flow for Super Admin first login
- Logout from all devices (`/api/auth/logout/all`)
- Login history API (`/api/profile/login-history`)
- Active sessions API (`/api/profile/sessions`)
- Audit logs API for Super Admin
- HOD department-scoped student import
- Indexed session lookup (fixes refresh token performance)
- Frontend: multi-mode login (password, mobile OTP, email OTP, staff)
- Frontend: MFA verify page, auto token refresh, password strength hints
- Bootstrap script for test staff account

### Security
- Auth middleware checks suspended/deleted/locked accounts
- OTP expiry default reduced to 5 minutes
- Super Admin blocked until MFA is enabled

## [0.1.0] - 2026-07-08

### Added
- Monorepo scaffold (`frontend`, `backend`, `shared`)
- Phase 1 PostgreSQL schema via Prisma (auth tables)
- Student master import (admin-only, gitignored JSON pattern)
- Registration flow: master verification → OTP → password → auto-login
- Login: register number + password, or mobile + OTP
- JWT access tokens (15 min) + rotated refresh tokens (httpOnly cookie)
- bcrypt password hashing, field encryption for mobile numbers
- RBAC middleware (Student, Staff, HOD, Super Admin)
- Account lockout after repeated failed logins
- MFA setup for HOD/Super Admin (TOTP via otplib)
- CSRF double-submit cookie protection
- Rate limiting on auth endpoints
- Audit logs and login history
- Auth API integration tests
- GitHub Actions CI (lint + test with PostgreSQL)
- Avichian Design Language foundation in frontend auth screens

### Security
- No real student PII committed to git
- Server-side validation on all auth inputs
- College-domain email restriction at registration
- Secure cookie flags for refresh tokens