# AVICHIAN Production Checklist

## Frontends (Netlify)

- [ ] Student repo connected: `avichian-student-app`
- [ ] Admin repo connected: `avichian-super-admin`
- [ ] `VITE_API_URL=https://api.avichian.in` on **both** (set before build)
- [ ] `netlify.toml` + `_redirects` present
- [ ] Production build succeeds (`npm run build`)
- [ ] Custom domains / SSL (optional)

## Backend (not Netlify)

- [ ] Long-running Node host
- [ ] `APP_ENV=production` / `NODE_ENV=production`
- [ ] `DATABASE_URL` + Prisma migrate/push
- [ ] JWT + encryption secrets (≥32 chars)
- [ ] `FRONTEND_URLS` lists both SPAs
- [ ] `PUBLIC_API_URL` absolute HTTPS
- [ ] R2 or durable upload disk
- [ ] `/api/health` green

## Feature smoke

- [ ] Login / register  
- [ ] Feed, stories, reels  
- [ ] Friends + search  
- [ ] Chat + calls  
- [ ] Notifications + profile  
- [ ] Super Admin dashboard + moderation  

## Security

- [ ] No backend secrets on Netlify  
- [ ] HTTPS everywhere  
- [ ] CORS only known origins  
- [ ] Super Admin role enforced server-side  
