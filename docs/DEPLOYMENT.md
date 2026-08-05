# AVICHIAN Production Deployment Guide

```
Students                         Super Admin
    │                                 │
    ▼                                 ▼
app.avichian.in              admin.avichian.in
(or *.netlify.app)           (or *.netlify.app)
    │                                 │
    └──────────────┬──────────────────┘
                   ▼
            api.avichian.in
         (Node.js + Express)
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   PostgreSQL            Cloudflare R2
```

**Do not host the Express API on Netlify.** Use Railway, Render, Fly.io, DigitalOcean, AWS, Azure, GCP, or a college VPS.

---

## Repositories

| Piece | GitHub | Host |
|-------|--------|------|
| Student App | [avichian-student-app](https://github.com/jathu1972-hub/avichian-student-app) | Netlify |
| Super Admin | [avichian-superadmin](https://github.com/jathu1972-hub/avichian-superadmin) | Netlify |
| Backend API | [avichian-backend](https://github.com/jathu1972-hub/avichian-backend) | Railway / Render / Fly / VPS |
| Full monorepo | [avichian](https://github.com/jathu1972-hub/avichian) | Optional monorepo deploy |

---

## 1. PostgreSQL

Providers: Neon, Supabase, Railway PostgreSQL, self-hosted.

1. Create a database.
2. Copy the connection string into `DATABASE_URL` (use `?sslmode=require` when offered).
3. From monorepo:

```bash
cd backend
npm ci
npx prisma generate
npx prisma db push
# or: npx prisma migrate deploy
```

---

## 2. Backend (Railway / Render / Fly / VPS)

### Environment variables

See `backend/.env.example`. Minimum production set:

```env
APP_ENV=production
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...long-random...
JWT_REFRESH_SECRET=...long-random...
ENCRYPTION_KEY=...
FRONTEND_URLS=https://YOUR-student.netlify.app,https://YOUR-admin.netlify.app
PUBLIC_API_URL=https://api.avichian.in
```

Aliases accepted:

| Docs name | Also accepted |
|-----------|----------------|
| JWT access | `JWT_SECRET` |
| JWT refresh | `REFRESH_SECRET` |
| CORS list | `CORS_ORIGIN` |
| R2 keys | `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`, `R2_ENDPOINT` |

### Deploy steps (monorepo root as build context)

```bash
npm ci
npm run build -w @avichian/shared
npm run db:generate -w backend
npm run build -w backend
npm run start -w backend
```

Bind `0.0.0.0` (already configured). Point DNS **api.avichian.in** → host. Enable HTTPS.

### Health check

`GET https://api.avichian.in/api/health` → `{ "success": true, ... }`

---

## 3. Cloudflare R2

Store profile photos, posts, stories, reels, documents.

1. Create bucket + R2 API token (Object Read & Write).
2. Enable public access or custom domain for `R2_PUBLIC_URL`.
3. Set:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=avichian-media
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
# optional: R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
```

Without R2, files go to `backend/uploads` (single-instance only).

---

## 4. Student App → Netlify

**Preferred:** connect [avichian-student-app](https://github.com/jathu1972-hub/avichian-student-app)

| Setting | Value |
|---------|--------|
| Build command | `npm run build` (from `netlify.toml`) |
| Publish | `dist` |
| Node | 20 |

**Environment (build-time):**

```env
VITE_API_URL=https://api.avichian.in
```

SPA routing: `netlify.toml` + `public/_redirects` → `/* → /index.html` (200).

Optional site name: `avichian` → `https://avichian.netlify.app`  
Custom domain: `app.avichian.in`

---

## 5. Super Admin → Netlify

Connect [avichian-superadmin](https://github.com/jathu1972-hub/avichian-superadmin)

Same build/publish as student. Same `VITE_API_URL`.

| Extra | Notes |
|-------|--------|
| Role guard | SPA only allows `SUPER_ADMIN`; API re-checks every route |
| Site name | e.g. `admin-avichian` |

Custom domain: `admin.avichian.in`

---

## 5b. Fix: `Unexpected token '<', "<!doctype "... is not valid JSON`

**Root cause:** the SPA called a relative `/api/...` URL on Netlify. Netlify has no Express server, so the SPA redirect returned `index.html`. `response.json()` then failed on `<!doctype html>`.

| Wrong | Right |
|-------|--------|
| Empty `VITE_API_URL` in production | `VITE_API_URL=https://api.your-host.com` |
| `http://localhost:4000` in Netlify | Public HTTPS API URL |
| Expecting Netlify to run Express | Backend on Railway / Render / Fly / VPS |

**Fix steps:**

1. Deploy backend → confirm `GET https://YOUR-API/api/health` returns JSON.
2. Netlify (student + admin) → Environment variables → `VITE_API_URL=https://YOUR-API` (origin only).
3. **Trigger a new production deploy** (Vite bakes env at build time).
4. DevTools → Network: requests go to `https://YOUR-API/api/...`, `Content-Type: application/json`.
5. Backend `FRONTEND_URLS` must list both Netlify origins (CORS + cookies).

The frontend now detects HTML responses and shows this message instead of a cryptic JSON parse error.

---

## 6. CORS & cookies

After both Netlify URLs exist, set backend:

```env
FRONTEND_URLS=https://avichian.netlify.app,https://admin-avichian.netlify.app,https://app.avichian.in,https://admin.avichian.in
```

Production refresh cookies use **SameSite=None; Secure** so cross-origin SPA → API sessions work. API must be **HTTPS**.

---

## 7. Custom domains & SSL

| Host | Domain | SSL |
|------|--------|-----|
| Netlify student | `app.avichian.in` | Automatic (Netlify) |
| Netlify admin | `admin.avichian.in` | Automatic |
| API host | `api.avichian.in` | Host TLS or Cloudflare proxy |

DNS: CNAME/A as your host documents. Add each domain to `FRONTEND_URLS`.

---

## 8. Production smoke checklist

- [ ] `GET /api/health` OK  
- [ ] Student login → Home  
- [ ] Registration (master-approved path)  
- [ ] Friend search + requests  
- [ ] Posts / Stories / Reels create + view media  
- [ ] Chat  
- [ ] Voice / video call signaling (WebRTC needs HTTPS)  
- [ ] Notifications  
- [ ] Profile + photo upload  
- [ ] Super Admin login (SUPER_ADMIN only)  
- [ ] Admin: students, moderation, reports, announcements  
- [ ] No CORS errors in browser console  
- [ ] Refresh session after hard reload  

---

## 9. Security (implemented)

| Control | Status |
|---------|--------|
| Helmet | Yes |
| CORS allowlist | Yes (`FRONTEND_URLS` / `CORS_ORIGIN`) |
| CSRF double-submit | Yes on mutating routes |
| JWT access + rotated refresh | Yes |
| bcrypt passwords | Yes |
| Prisma parameterized queries | Yes (SQL injection) |
| Rate limit on auth/OTP | Yes |
| Production lockout | 5 fails / 15 min |
| Secure cookies (prod) | SameSite=None; Secure |
| SUPER_ADMIN API middleware | Yes |
| No secrets in `VITE_*` | Enforced by design |

---

## 10. Performance (frontends)

- Route-level **lazy loading** (`React.lazy` + `Suspense`)
- **Manual chunks** (react, framer-motion, socket.io)
- Asset long-cache headers on Netlify `/assets/*`
- Production `vite build` with tree-shaking

---

## 11. Local development

```bash
# Monorepo (all three)
cd avichian
npm run dev
# Student http://localhost:5173
# Admin   http://localhost:5174
# API     http://localhost:4000

# Or separate frontends + monorepo API
cd avichian && npm run dev -w backend
cd avichian-student-app && npm run dev
cd avichian-super-admin && npm run dev
```

Leave `VITE_API_URL` empty locally (Vite proxy).

---

## Remaining before “real” production

1. Deploy API with real secrets and DNS for `api.avichian.in`  
2. Create two Netlify sites; set `VITE_API_URL`; redeploy after env change  
3. Update `FRONTEND_URLS` with exact Netlify URLs  
4. Configure R2 for media durability  
5. Bootstrap super admin (`backend/scripts/bootstrap-super-admin.ts`)  
6. Full WebRTC/LiveKit for production-grade calls if needed beyond signaling  
