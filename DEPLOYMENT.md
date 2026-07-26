# AVICHIAN Production Deployment

```
Student App (Netlify)          Super Admin (Netlify)
avichian.netlify.app           admin.avichian.netlify.app
app.avichian.in                admin.avichian.in
         \                          /
          \                        /
           ▼                      ▼
              https://api.avichian.in
              (Node.js + Express — NOT Netlify)
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
     PostgreSQL                 Cloudflare R2
```

Both frontends call the **same** backend API and database. Never put backend secrets in Netlify frontend env.

---

## 1. Backend (Railway / Render / Fly / VPS)

Do **not** host Express on Netlify.

### Required env (backend host)

```env
APP_ENV=production
NODE_ENV=production
PORT=4000

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...long-random...
JWT_REFRESH_SECRET=...long-random...
ENCRYPTION_KEY=...32-byte-hex-or-strong-secret...

# CORS — every browser origin that calls the API
FRONTEND_URLS=https://avichian.netlify.app,https://admin.avichian.netlify.app,https://app.avichian.in,https://admin.avichian.in

APP_URL=https://app.avichian.in
SUPER_ADMIN_PORTAL_URL=https://admin.avichian.in
PUBLIC_API_URL=https://api.avichian.in

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# Lockout (production defaults)
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
```

### Deploy steps

```bash
cd backend
npm ci
npx prisma generate
npx prisma db push   # or migrate deploy
npm run build
npm start            # node dist/index.js — bind 0.0.0.0
```

Point DNS `api.avichian.in` → your host. Enable HTTPS (TLS).

---

## 2. Student App (Netlify)

| Setting | Value |
|---------|--------|
| Base directory | `apps/student-app` |
| Build command | from `netlify.toml` (builds monorepo shared + app) |
| Publish directory | `dist` |

### Netlify environment variables

```env
VITE_API_URL=https://api.avichian.in
```

Only `VITE_*` vars are safe for the browser. No JWT secrets.

### Custom domain

`app.avichian.in` → this Netlify site.

---

## 3. Super Admin (Netlify)

| Setting | Value |
|---------|--------|
| Base directory | `apps/super-admin-portal` |
| Build / publish | from `netlify.toml` → `dist` |

### Environment

```env
VITE_API_URL=https://api.avichian.in
```

### Custom domain

`admin.avichian.in` → this Netlify site.

---

## 4. How the apps connect

| App | API base |
|-----|----------|
| Local Vite | `/api` (proxied to `localhost:4000`) |
| Netlify production | `VITE_API_URL` + `/api` → `https://api.avichian.in/api` |

Socket.IO uses the same origin as `VITE_API_URL`.

Media paths like `/api/media/...` are resolved against `VITE_API_URL` / `PUBLIC_API_URL` so images work when the SPA is not on the API host.

---

## 5. CORS & cookies

- Backend `FRONTEND_URLS` must list every Netlify and custom domain.
- Production cookies use `SameSite=None; Secure` so cross-origin SPA → API sessions work.
- JWT access tokens live in `localStorage` on each frontend; refresh tokens are httpOnly cookies on the **API** domain.

---

## 6. Local development (unchanged)

```bash
# root
npm run dev
# Student http://localhost:5173
# Admin   http://localhost:5174
# API     http://localhost:4000
```

Leave `VITE_API_URL` unset locally so Vite’s proxy is used.

---

## 7. Checklist before go-live

- [ ] Backend health: `https://api.avichian.in/api/health`
- [ ] Student login → Home
- [ ] Super Admin login → Dashboard (SUPER_ADMIN only)
- [ ] Create student in admin → login on student app
- [ ] Upload story / post → media loads from R2 or `api.../api/media`
- [ ] Friend search + chat
- [ ] CORS errors absent in browser console
