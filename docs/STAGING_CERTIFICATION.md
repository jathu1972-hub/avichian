# AVICHIAN staging certification

This runbook creates a deployment lane that can fail safely without changing
production.  Do not use a production database URL, storage bucket, TURN
credential, Netlify site, or test account in staging.

## Isolation contract

| Component | Production | Staging requirement |
| --- | --- | --- |
| API | `avichian-api` | Separate `avichian-api-staging` Render service |
| PostgreSQL | `avichian-db` | Separate `avichian-staging-db`, never a schema in production |
| Student/admin sites | production Netlify sites | Separate Netlify staging sites or branch deploy URLs |
| Object storage | production R2 bucket | Separate R2 bucket with staging-only credentials |
| Calls | production TURN/LiveKit | Separate TURN user/credential or staging LiveKit project |
| Users | real accounts | explicitly labelled staging accounts only |

`backend/render.staging.yaml` is the source-controlled Render Blueprint. It
does not contain secrets. Import it from the `staging` branch while the
Render **Staging** project environment is selected.

## Configure staging in order

1. Create a backup/export of the production database and record its time and
   restore procedure. Never use this as a staging connection string.
2. Create `avichian-staging-db` and `avichian-api-staging` from the staging
   blueprint. Wait for `/api/health` to report a connected database.
3. In Render, set the generated staging HTTPS URL as `PUBLIC_API_URL`. Set
   `FRONTEND_URLS`, `FRONTEND_URL`, and `ADMIN_URL` to the two staging Netlify
   HTTPS origins only.
4. Create two Netlify staging sites (student and Super Admin) or use isolated
   branch deploys. Build each with `VITE_API_URL=<staging-api>/api`; do not
   copy production client environment values. Configure the same value in the
   Netlify **staging** deploy context, then deploy the `staging` branch.
5. Create a staging-only R2 bucket and least-privilege API token. Put
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME`, and `R2_PUBLIC_URL` in Render secrets. Do not add any of
   them to Vite, Git, Netlify public environment variables, screenshots, or
   logs.
6. Configure a real TLS TURN provider (or a staging LiveKit project). Put
   `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL` in Render secrets. The
   browser receives ICE configuration only through
   `GET /api/calls/ice-config`; it must not contain a long-lived provider
   secret.
7. Run `npx prisma migrate deploy --schema backend/prisma/schema.prisma`
   against staging. Do not use `prisma db push` in either staging or
   production.
8. Seed only designated staging Super Admin and student test accounts. Confirm
   their labels and reset passwords before sharing access.

## Certification matrix

Run the following against staging only and preserve non-secret evidence:

- Student and Super Admin login, authorization separation, first-password
  change, logout, theme persistence, posts, messages, communities, events,
  notifications, and media upload/download after a redeploy.
- Super Admin creation, reset, suspension/reactivation, moderation, reports,
  and XLSX/XLS/CSV import. Test valid, malformed, empty, unauthenticated and
  student-authorized import-detect requests.
- Socket.IO with two test accounts: direct message, typing, seen receipt,
  online state, reconnect after a brief network loss, and no console/network
  errors.
- WebRTC with two devices on different networks: invite, accept, decline,
  audio/video permission denial, media toggle, disconnect/reconnect, call
  end, failed call, and an ICE **relay** candidate. STUN-only success is not
  sufficient.
- Mobile and desktop browser matrix: 320, 360, 375, 390, 412, 430, 768, 1024,
  1366 and 1440 px. Test all five themes and check scrolling, contrast,
  clipping, touch targets, safe areas and decoration pointer interception.

## Production release and rollback

Before production, capture a new database backup, migration list, active
Render/Netlify release IDs, current environment-variable key list (never
values), and an authenticated smoke-test result. Deploy in this order:

1. reviewed backend migration and API;
2. student staging build promoted to production;
3. Super Admin staging build promoted to production;
4. real-account smoke test and Render/Netlify error-log review.

If a critical regression appears, immediately roll the two Netlify sites and
Render API back to their recorded release IDs. Do not roll a database migration
back blindly: use a reviewed forward repair or a tested restore plan.

## Release gate

Production is blocked until staging has a separate connected database, durable
object storage, real TURN relay verification, successful import certification,
and passing production builds/lint/tests. Missing credentials are a deployment
blocker, not a reason to substitute mock values.
