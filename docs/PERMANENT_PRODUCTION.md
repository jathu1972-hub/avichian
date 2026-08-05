# AVICHIAN — Permanent production architecture

```
                AVICHIAN (production)

┌────────────────────────────┐     ┌────────────────────────────┐
│ Student App                │     │ Super Admin                │
│ GitHub Pages (static)      │     │ GitHub Pages (static)      │
│ …/avichian-student-app/    │     │ …/avichian-superadmin/     │
└─────────────┬──────────────┘     └─────────────┬──────────────┘
              │ HTTPS                            │ HTTPS
              └───────────────┬──────────────────┘
                              ▼
                 ┌────────────────────────┐
                 │ Backend API (always on)│
                 │ Render / Railway / Fly │
                 │ Express + Socket.IO    │
                 └───────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        PostgreSQL      R2 / S3 media    LiveKit (optional)
```

## What GitHub Pages cannot do

| Feature | GitHub Pages | Needs backend |
|---------|--------------|---------------|
| Serve React UI | Yes | — |
| Login / JWT / sessions | No | Yes |
| PostgreSQL | No | Yes |
| Uploads / chat / calls | No | Yes |
| Socket.IO | No | Yes |
| Permanent “stay logged in” | Only if API is online | Yes |

**“Unable to connect to the server”** means the browser cannot reach a **live** API URL. It is not a React bug and not fixed by storing tokens on GitHub Pages.

---

## Session / token model (already implemented)

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access JWT | ~15 minutes (`ACCESS_TOKEN_EXPIRY`) | `localStorage` (SPA) + `Authorization` header |
| Refresh token | 7–30 days (`REFRESH_TOKEN_EXPIRY_DAYS`) | **HttpOnly cookie** (`SameSite=None; Secure` for cross-site Pages → API) |

Flow:

1. Login → access token + set refresh cookie  
2. API calls use access token  
3. On 401 → `POST /api/auth/refresh` with cookie → new access token  
4. Logout / logout-all → revoke session(s) on server  

Also supported: device session list, revoke one session, revoke all after password reset.

Do **not** try to “save the access token permanently on GitHub Pages”. Keep access tokens short-lived; rely on the refresh cookie + online API.

---

## Deploy checklist (order matters)

### 1. Backend + Postgres (Render recommended)

1. Open https://dashboard.render.com → **New** → **Blueprint**  
2. Connect GitHub repo **`jathu1972-hub/avichian-backend`**  
3. Use included `render.yaml` (web service + free Postgres)  
4. After deploy, copy service URL, e.g.  
   `https://avichian-api.onrender.com`  
5. Set env (if not already from blueprint):

```env
NODE_ENV=production
APP_ENV=production
CROSS_SITE_COOKIES=true
FRONTEND_URLS=https://jathu1972-hub.github.io
PUBLIC_API_URL=https://avichian-api.onrender.com
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY_DAYS=30
```

6. Health must return 200:

```text
GET https://YOUR-API.onrender.com/api/health
→ { "success": true, "data": { "status": "ok", "database": "connected", "server": "running" } }
```

7. Seed Super Admin (Render shell or one-off job):

```bash
npm run seed:admin
# or: npx tsx scripts/seed-super-admins.ts
```

### 2. Point both frontends at the API

In **each** of:

- `avichian-student-app/public/config.json`  
- `avichian-superadmin/public/config.json`  

```json
{
  "apiUrl": "https://YOUR-API.onrender.com"
}
```

No `/api` suffix in `apiUrl` (the app appends `/api`).  
**Never** put `localhost` or `127.0.0.1` in production config.

Optional GitHub Actions variable `VITE_API_URL`:

```env
VITE_API_URL=https://YOUR-API.onrender.com/api
```

Commit + push → Pages redeploys.

### 3. Verify

| Check | URL |
|-------|-----|
| Student | https://jathu1972-hub.github.io/avichian-student-app/#/login |
| Super Admin | https://jathu1972-hub.github.io/avichian-superadmin/#/login |
| Health | https://YOUR-API.onrender.com/api/health |

Hard-refresh (Ctrl+F5). Login, posts, search, chat, calls should work **without your PC running**.

### 4. Media (production uploads)

Without R2, files stay on the Render disk and **are lost on redeploy**. Set Cloudflare R2 env vars on the API service (see `backend/.env.example`).

### 5. Calls (optional but recommended)

- STUN is free by default  
- TURN (Coturn) or LiveKit for reliable mobile calls  

---

## Temporary vs permanent

| Mode | Backend | Works when PC is off? |
|------|---------|------------------------|
| Cloudflare tunnel to laptop | Your PC | **No** |
| Render / Railway API + Postgres | Cloud | **Yes** |

Tunnel is only for local demos. Permanent production = hosted API + hosted DB.

---

## Repos

| Piece | Repo |
|-------|------|
| Student SPA | https://github.com/jathu1972-hub/avichian-student-app |
| Super Admin SPA | https://github.com/jathu1972-hub/avichian-superadmin |
| Backend API | https://github.com/jathu1972-hub/avichian-backend |
