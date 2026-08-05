# AVICHIAN

**AVICHIAN** is a private campus platform for Avichi Arts and Science College (Visual Communication).  
It combines student social features, chat, voice/video calls, campus events, communities, and a Super Admin console.

> **One repository.** Future work is always: edit → `git commit` → `git push`. Do not create extra repos for the same product.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│ Student App         │     │ Super Admin Portal  │
│ (Netlify / Pages)   │     │ (Netlify / Pages)   │
└──────────┬──────────┘     └──────────┬──────────┘
           │ HTTPS                     │ HTTPS
           └────────────┬──────────────┘
                        ▼
              ┌──────────────────┐
              │ Backend API      │
              │ Express +        │
              │ Socket.IO        │
              │ (Render/Railway) │
              └────────┬─────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   PostgreSQL      R2 / S3       LiveKit (opt.)
```

GitHub Pages / Netlify host **static frontends only**.  
Express + PostgreSQL **must** run on a always-on host (Render, Railway, Fly, VPS).

---

## Folder structure

```
avichian/                    ← monorepo root (this repo)
│
├── student-app/             Student SPA (React + Vite)
├── superadmin-portal/       Super Admin SPA (React + Vite)
├── backend/                 Express API, Prisma, Socket.IO
├── shared/                  Shared TypeScript types & validation
├── database/                Database docs (schema lives in backend/prisma)
├── docs/                    Deployment & operations guides
├── scripts/                 Helper scripts (tunnel, config)
├── seed-data/               Optional seed fixtures (no real PII in git)
├── .github/workflows/       CI
├── package.json             npm workspaces root
└── README.md
```

| Package | npm name | Dev port |
|---------|----------|----------|
| Student App | `@avichian/student-app` | 5173 |
| Super Admin | `@avichian/super-admin-portal` | 5174 |
| Backend | `@avichian/backend` | 4000 |
| Shared | `@avichian/shared` | — |

---

## Prerequisites

- Node.js **20+**
- PostgreSQL **14+**
- npm 10+

---

## Installation (local)

```bash
git clone https://github.com/jathu1972-hub/avichian.git
cd avichian
npm install

# Backend env
cp backend/.env.example backend/.env
# Edit DATABASE_URL, JWT secrets, ENCRYPTION_KEY

# Database
npm run db:generate
npm run db:push

# Optional: seed super admins / test friends (see backend/scripts)

# Run everything
npm run dev
```

| App | URL |
|-----|-----|
| Student | http://localhost:5173 |
| Super Admin | http://localhost:5174 |
| API health | http://localhost:4000/api/health |

Frontends use the Vite **`/api` proxy** in development (no production localhost in the browser bundle).

---

## Environment variables

### Backend (`backend/.env`)

See `backend/.env.example`. Minimum:

```env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...long-random...
JWT_REFRESH_SECRET=...long-random...
ENCRYPTION_KEY=...
PORT=4000
NODE_ENV=development
FRONTEND_URLS=http://localhost:5173,http://localhost:5174
```

Production:

```env
NODE_ENV=production
APP_ENV=production
CROSS_SITE_COOKIES=true
FRONTEND_URLS=https://your-student.netlify.app,https://your-admin.netlify.app
PUBLIC_API_URL=https://your-api.onrender.com
```

### Frontends

| File | Purpose |
|------|---------|
| `student-app/.env.development` | Local (usually empty → proxy) |
| `student-app/.env.production` | Build-time `VITE_API_URL` |
| `student-app/public/config.json` | Runtime API origin (overrides build for Pages) |
| Same pattern for `superadmin-portal/` | |

```env
# Production example (origin or …/api)
VITE_API_URL=https://your-api.onrender.com
```

```json
{ "apiUrl": "https://your-api.onrender.com" }
```

**Never** put secrets in `VITE_*` variables (they are public in the browser).

---

## Database setup

```bash
npm run db:generate   # Prisma client
npm run db:push       # Dev: sync schema
npm run db:migrate    # Dev: create migration
```

Production start (Render):

```bash
npx prisma migrate deploy || npx prisma db push
node dist/index.js
```

Details: [`database/README.md`](database/README.md)

---

## Deployment (auto-deploy from `main`)

### 1. Backend → Render

1. [Render](https://dashboard.render.com) → **New Blueprint**  
2. Connect **`jathu1972-hub/avichian`**  
3. Use `backend/render.yaml` (or Web Service: root `.`, build `npm ci && npm run build -w @avichian/shared && npm run build -w backend`)  
4. Attach Postgres; set `FRONTEND_URLS` and `PUBLIC_API_URL`  
5. Health: `https://YOUR-API.onrender.com/api/health`

Every **push to `main`** that changes backend files redeploys when auto-deploy is on.

### 2. Student App → Netlify

1. New site from Git → this repo  
2. Base directory: **empty** (monorepo root)  
3. Build command / publish from `student-app/netlify.toml`  
4. Env: `VITE_API_URL=https://YOUR-API.onrender.com`  
5. Also set `public/config.json` `apiUrl` if using runtime config  

### 3. Super Admin → Netlify

Same as student, using `superadmin-portal/netlify.toml` and its own Netlify site.

### Update workflow (daily)

```bash
# On your machine
cd avichian
# ... edit code ...

git add .
git commit -m "Describe update"
git push origin main
```

Then:

```
GitHub main
   ├─► Netlify rebuilds student-app
   ├─► Netlify rebuilds superadmin-portal
   └─► Render redeploys backend
```

No new folders. No new repositories.

---

## Auth model

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access JWT | ~15m | `localStorage` + `Authorization` header |
| Refresh | days–weeks | HttpOnly cookie (`SameSite=None` when SPA and API differ) |

Expired access tokens are refreshed via `POST /api/auth/refresh`.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/start-public-api.ps1` | Local API + Cloudflare tunnel for demos |
| `scripts/point-frontends-to-api.ps1` | Write both `config.json` files to a public API origin |

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) on `main` and `development`:

- install → build shared → Prisma → lint → test → build both SPAs  

---

## Branches

| Branch | Use |
|--------|-----|
| `main` | Production (auto-deploy) |
| `development` | Integration / staging work |

```bash
git checkout development
# feature work...
git push origin development
# PR into main when ready
```

---

## License

Private — Avichi Arts and Science College / AVICHIAN project.

---

## Support docs

- [`docs/PERMANENT_PRODUCTION.md`](docs/PERMANENT_PRODUCTION.md)  
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)  
- [`docs/PRODUCTION_DEPLOY.md`](docs/PRODUCTION_DEPLOY.md)  
