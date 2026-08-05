# AVICHIAN Production Checklist

## Architecture

- [ ] Backend **not** on Netlify (Render / Railway / Fly / VPS)
- [ ] Student SPA on Netlify → https://app.avichian.com
- [ ] Super Admin SPA on Netlify → https://admin.avichian.com
- [ ] API → https://api.avichian.com
- [ ] One PostgreSQL for both portals

## Env

### Netlify (both sites)
- [ ] `VITE_API_URL=https://api.avichian.com` (or real API host)
- [ ] Redeployed after env change

### Backend
- [ ] `DATABASE_URL` (SSL)
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (or `JWT_SECRET` / `REFRESH_SECRET`)
- [ ] `ENCRYPTION_KEY`
- [ ] `FRONTEND_URLS` or `FRONTEND_URL` + `ADMIN_URL`
- [ ] `PUBLIC_API_URL=https://api.avichian.com`
- [ ] R2 fully set (or accept single-instance local uploads)

## Database
- [ ] `prisma migrate deploy` (or `db push`) succeeded
- [ ] `prisma generate` on build
- [ ] Super Admin seeded (`npm run seed:admin`)
- [ ] Tables present (User, Session, Post, Story, Reel, …)

## Storage
- [ ] Image upload
- [ ] Video upload
- [ ] Stories / reels / profile / community banners

## Smoke tests
- [ ] Health JSON
- [ ] Student login + password change + feed
- [ ] Super Admin create student + reset password
- [ ] Chat / calls / search / events / communities
- [ ] No HTML-as-JSON errors
- [ ] No CORS / Failed to fetch in production

See [PRODUCTION_DEPLOY.md](./PRODUCTION_DEPLOY.md) for full steps.
