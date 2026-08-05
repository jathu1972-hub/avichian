# AVICHIAN Production Deployment

```
                AVICHIAN PRODUCTION

┌───────────────────────────┐
│ Student App (Netlify)     │
│ https://app.avichian.com  │
└──────────────┬────────────┘
               │
┌──────────────▼────────────┐
│ Super Admin (Netlify)     │
│ https://admin.avichian.com│
└──────────────┬────────────┘
               │ HTTPS API
               ▼
┌────────────────────────────────┐
│ Express Backend (Render/Railway)│
│ https://api.avichian.com        │
└──────────────┬─────────────────┘
               │
┌──────────────▼──────────────┐
│ PostgreSQL Database         │
└─────────────────────────────┘
```

**Do not deploy Express on Netlify.** Netlify hosts only the two SPAs.

---

## Final production URLs

| Service | URL |
|---------|-----|
| Student App | https://app.avichian.com |
| Super Admin | https://admin.avichian.com |
| Backend API | https://api.avichian.com |
| Health check | https://api.avichian.com/api/health |

Until custom DNS is attached, use the host defaults (e.g. `*.netlify.app`, `*.onrender.com`) and put **those exact origins** into `FRONTEND_URLS` and `VITE_API_URL`.

---

## Prerequisites

- GitHub repos ready:
  - [avichian-student-app](https://github.com/jathu1972-hub/avichian-student-app)
  - [avichian-superadmin](https://github.com/jathu1972-hub/avichian-superadmin)
  - [avichian-backend](https://github.com/jathu1972-hub/avichian-backend)
- Accounts: Netlify (×2 sites), Render **or** Railway, Cloudflare R2 (recommended), domain DNS for `avichian.com`

---

## 1. PostgreSQL + Backend (Render example)

### Option A — Render Blueprint

1. Render → **New** → **Blueprint**
2. Connect `avichian-backend`
3. Use `render.yaml` (creates web service + Postgres)
4. Set secrets in the dashboard:

```env
# Auto from blueprint + generateValue for JWT / ENCRYPTION_KEY
FRONTEND_URL=https://app.avichian.com
ADMIN_URL=https://admin.avichian.com
FRONTEND_URLS=https://app.avichian.com,https://admin.avichian.com
PUBLIC_API_URL=https://api.avichian.com
# Until custom domain: use https://avichian-api.onrender.com
```

R2 (recommended):

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=avichian-media
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
```

5. Deploy → open `/api/health` → must return JSON  
6. Custom domain: `api.avichian.com` → Render service  
7. Seed Super Admin (one-time):

```bash
# From Render shell or local against prod DATABASE_URL
SUPER_ADMIN_PASSWORD='YourStrongPass1!' npm run seed:admin
```

### Option B — Railway

1. New project → Deploy from GitHub `avichian-backend`
2. Add **PostgreSQL** plugin  
3. Variables: same as above (use Railway `DATABASE_URL`)  
4. `railway.toml` provides build/start commands  
5. Domain: `api.avichian.com`

### DB commands (start script already runs these)

```bash
npx prisma generate
npx prisma migrate deploy   # preferred
# or fallback: npx prisma db push
```

---

## 2. Student App → Netlify

1. **Add new site** → Import `avichian-student-app`
2. Build settings (standalone repo):

| Setting | Value |
|---------|--------|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node | 20 |

3. **Environment variables** (build-time):

```env
VITE_API_URL=https://api.avichian.com
```

Use the real API host if DNS is not ready yet, e.g. `https://avichian-api.onrender.com`.

4. Deploy  
5. Domain management → `app.avichian.com`  
6. After **any** change to `VITE_*`, **Redeploy** (values are baked into JS)

---

## 3. Super Admin → Netlify

1. Import `avichian-superadmin`
2. Same build/publish as student
3. Env:

```env
VITE_API_URL=https://api.avichian.com
```

4. Domain → `admin.avichian.com`

---

## 4. CORS (backend)

Must allow **exact** SPA origins (no trailing slash):

```env
FRONTEND_URLS=https://app.avichian.com,https://admin.avichian.com
# or
FRONTEND_URL=https://app.avichian.com
ADMIN_URL=https://admin.avichian.com
```

Also include temporary Netlify subdomains during setup:

```env
FRONTEND_URLS=https://app.avichian.com,https://admin.avichian.com,https://YOUR-student.netlify.app,https://YOUR-admin.netlify.app
```

Methods allowed by API: `GET, POST, PUT, PATCH, DELETE, OPTIONS` with credentials.

---

## 5. DNS (Cloudflare / registrar)

| Host | Type | Target |
|------|------|--------|
| `app` | CNAME | Netlify student site |
| `admin` | CNAME | Netlify admin site |
| `api` | CNAME | Render/Railway service |

Enable HTTPS on all three.

---

## 6. Verification checklist

### API
- [ ] `GET https://api.avichian.com/api/health` → `{ "success": true, ... }`
- [ ] `GET https://api.avichian.com/api/csrf-token` → JSON with `csrfToken`
- [ ] Content-Type is `application/json` (never HTML)

### Student (DevTools → Network)
- [ ] Requests go to `https://api.avichian.com/api/...` (not `app.avichian.com/api`)
- [ ] Login, force password change, home feed
- [ ] Upload post / story / reel / profile photo
- [ ] Chat + call (Socket.IO + WebRTC)
- [ ] Search, communities, events, settings, logout

### Super Admin
- [ ] Login
- [ ] Create student + temporary password
- [ ] Reset password / force change
- [ ] Create community / event
- [ ] Moderation (delete post/reel/story)
- [ ] Reports / suspend / activate
- [ ] Create Super Admin (if allowed)

### Shared data
- [ ] Student created in admin appears in student login
- [ ] Same PostgreSQL for both portals

---

## 7. Common failures

| Symptom | Fix |
|---------|-----|
| `Unexpected token '<'` | Set `VITE_API_URL` + redeploy Netlify |
| `Failed to fetch` / CORS | Add SPA origins to `FRONTEND_URLS` / `FRONTEND_URL`+`ADMIN_URL` |
| Uploads fail multi-instance | Configure R2 fully |
| Refresh login fails cross-site | API must be HTTPS; cookies use SameSite=None |
| Empty DB | Run migrate/push + `npm run seed:admin` |

---

## Environment variable summary

### Netlify Student + Admin
```env
VITE_API_URL=https://api.avichian.com
```

### Backend
```env
DATABASE_URL=...
JWT_ACCESS_SECRET=...   # or JWT_SECRET
JWT_REFRESH_SECRET=...  # or REFRESH_SECRET
ENCRYPTION_KEY=...
FRONTEND_URL=https://app.avichian.com
ADMIN_URL=https://admin.avichian.com
FRONTEND_URLS=https://app.avichian.com,https://admin.avichian.com
PUBLIC_API_URL=https://api.avichian.com
R2_BUCKET=...           # or R2_BUCKET_NAME
R2_ACCESS_KEY=...       # or R2_ACCESS_KEY_ID
R2_SECRET_KEY=...       # or R2_SECRET_ACCESS_KEY
R2_ENDPOINT=...
R2_PUBLIC_URL=...
```

---

## What this agent cannot do without your logins

Cloud deploys require **your** Netlify / Render / Railway accounts and DNS.

This repository is production-configured so that after you connect those hosts and set the env vars above, both SPAs share one backend and one PostgreSQL database with no localhost API URLs in production builds.
