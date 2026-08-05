# Connect AVICHIAN to Netlify (permanent working links)

Netlify hosts the **two frontends only**. The API stays on Render/Railway.

## Permanent links (after you connect GitHub)

| App | GitHub repo | Netlify site name (recommended) | Permanent link |
|-----|-------------|-----------------------------------|----------------|
| Student | [avichian-student-app](https://github.com/jathu1972-hub/avichian-student-app) | `avichian-student-app` | **https://avichian-student-app.netlify.app** |
| Super Admin | [avichian-superadmin](https://github.com/jathu1972-hub/avichian-superadmin) | `avichian-superadmin` | **https://avichian-superadmin.netlify.app** |

These `*.netlify.app` URLs are permanent for the site as long as the site exists.

Optional custom domains later:

- https://app.avichian.com  
- https://admin.avichian.com  

---

## 10-minute setup (do this in the browser)

### A. Student App

1. Open https://app.netlify.com → **Add new site** → **Import an existing project**
2. Choose **GitHub** → authorize → select **`jathu1972-hub/avichian-student-app`**
3. Build settings (auto from `netlify.toml`):
   - Build command: `npm ci && npm run build`
   - Publish directory: `dist`
4. **Site settings → Environment variables → Add a variable**:

   | Key | Value |
   |-----|--------|
   | `VITE_API_URL` | Your live API origin, e.g. `https://avichian-api.onrender.com` or `https://api.avichian.com` |

   No trailing slash. Not `localhost`.

5. **Deploy site**
6. Site configuration → **Domain management** → note the permanent URL  
   (or rename site to `avichian-student-app` so the link is exactly  
   `https://avichian-student-app.netlify.app`)

### B. Super Admin

1. **Add new site** → Import **`jathu1972-hub/avichian-superadmin`**
2. Same build: `npm ci && npm run build` → `dist`
3. Env: **`VITE_API_URL`** = same API as student
4. Deploy → permanent URL  
   `https://avichian-superadmin.netlify.app` (if you name the site that way)

### C. Backend CORS (required for working login)

On Render/Railway backend env, set:

```env
FRONTEND_URLS=https://avichian-student-app.netlify.app,https://avichian-superadmin.netlify.app
FRONTEND_URL=https://avichian-student-app.netlify.app
ADMIN_URL=https://avichian-superadmin.netlify.app
PUBLIC_API_URL=https://YOUR-API-HOST
```

Redeploy backend after changing CORS.

### D. Verify “working model”

1. Open student Netlify URL → login  
2. DevTools → Network: calls go to **`VITE_API_URL/api/...`**, status 200, JSON  
3. Super Admin Netlify URL → login with Super Admin  
4. No `Unexpected token '<'` (that means `VITE_API_URL` missing — set env + **Clear cache and deploy site**)

---

## Important

| Hosts on Netlify | Does NOT host on Netlify |
|------------------|---------------------------|
| Student React app | Express API |
| Super Admin React app | PostgreSQL |
| | Socket.IO / uploads API |

Without a **live backend** URL in `VITE_API_URL`, Netlify links open the UI but login/API fail.

---

## After connect — paste back

Send:

1. Student Netlify URL  
2. Admin Netlify URL  
3. Backend API URL  

…and we can confirm CORS + `VITE_API_URL` strings exactly.
