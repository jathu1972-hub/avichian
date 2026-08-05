# AVICHIAN — daily update workflow

## One repo forever

Repository: https://github.com/jathu1972-hub/avichian  

Do **not** create `avichian-student-app`, `avichian-backend`, etc. for ongoing work. Those older splits are legacy; this monorepo is the source of truth.

## Edit → commit → push

```bash
cd C:\Users\GOD\avichian

# edit student-app / superadmin-portal / backend / shared

git status
git add .
git commit -m "Clear description of the change"
git push origin main
```

## What happens next

| Platform | Action |
|----------|--------|
| Netlify (student) | Rebuilds `student-app` from `main` |
| Netlify (admin) | Rebuilds `superadmin-portal` from `main` |
| Render / Railway | Redeploys `backend` if service is linked to this repo |

## Local check before push

```bash
npm run lint
npm run build
```

## Feature branch (optional)

```bash
git checkout development
git checkout -b feature/my-change
# ... work ...
git push -u origin feature/my-change
# open PR → development → main
```
