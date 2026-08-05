# Database

AVICHIAN uses **PostgreSQL** with **Prisma ORM**.

## Source of truth

| Path | Purpose |
|------|---------|
| [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) | Prisma schema (models, enums) |
| [`../backend/prisma/migrations/`](../backend/prisma/migrations/) | SQL migrations |
| [`../seed-data/`](../seed-data/) | Optional seed fixtures (no real PII in git) |

Prisma stays under `backend/` so the API package can run `prisma generate` / `migrate` in production without path confusion.

## Local setup

```bash
# From monorepo root
cp backend/.env.example backend/.env
# Edit DATABASE_URL to your local PostgreSQL

npm run db:generate
npm run db:push
# or: npm run db:migrate
```

## Production

Set `DATABASE_URL` on Render / Railway (Postgres add-on or Neon / Supabase).

```bash
npm run db:migrate:deploy -w backend
# or start command runs: npx prisma migrate deploy || npx prisma db push
```

## Health

`GET /api/health` returns `"database": "connected"` when Prisma can query the server.
