# Avichian

Private campus platform for **Avichi Arts and Science College — Department of Visual Communication**.

## Structure

```
avichian/
├── frontend/          # React + Vite + Tailwind + Framer Motion
├── backend/           # Express + Prisma + PostgreSQL
├── shared/            # Shared types & validation
├── seed-data/         # Gitignored student master (see example file)
└── .github/workflows/ # CI
```

## Quick start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 16+

### 2. Environment

```bash
cp .env.example .env
# Edit DATABASE_URL, JWT secrets, ENCRYPTION_KEY
```

### 3. Student master data (local only — never commit)

```bash
cp seed-data/student_master.example.json seed-data/student_master.json
# Replace with real roster locally, or use admin import endpoint
```

### 4. Install & run

```bash
npm install
npm run build -w shared
npm run db:generate -w backend
npm run db:push -w backend
npm run dev
```

- API: http://localhost:4000
- App: http://localhost:5173

### 5. Import student master (HOD/Super Admin)

After creating an admin account, `POST /api/admin/student-master/import-file` or `POST /api/admin/student-master/import` with JSON body.

## Phase status

**Phase 1 (Identity & Auth)** — scaffolded. Confirm before Phase 2.

See `CHANGELOG.md` and `TODO.md` for progress.