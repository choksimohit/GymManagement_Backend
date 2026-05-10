# Gym Management — Backend

REST API built with **Node.js + Express + TypeScript + Prisma**, backed by **PostgreSQL (Supabase)**.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Language | TypeScript 5 |
| ORM | Prisma 5 |
| Database | PostgreSQL via Supabase |
| Auth | JWT (jsonwebtoken) |
| Validation | Zod |
| Password hashing | bcryptjs |

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma        # Database schema (all 10 entities)
├── src/
│   ├── app.ts               # Express app entry point
│   ├── middleware/
│   │   ├── auth.ts          # JWT authenticate + requireAdmin guards
│   │   └── errorHandler.ts  # Global error handler
│   └── routes/
│       ├── auth.ts          # POST /api/auth/login, /register
│       ├── members.ts       # CRUD /api/members
│       ├── plans.ts         # CRUD /api/plans
│       ├── memberships.ts   # CRUD /api/memberships + payments
│       ├── attendance.ts    # /api/attendance + QR check-in/out
│       ├── bodyProgress.ts  # CRUD /api/body-progress
│       ├── dashboard.ts     # GET /api/dashboard
│       └── reports.ts       # GET /api/reports/memberships, /revenue, /memberships/csv
├── .env.example
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```env
# Supabase — Project Settings → Database → Connection string
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
PORT=4000
FRONTEND_URL="http://localhost:3000"
QR_SECRET="gym-qr-secret-key"
```

### 3. Push schema to database

```bash
npm run db:generate   # generate Prisma client
npm run db:push       # create tables in Supabase
```

### 4. Start development server

```bash
npm run dev           # runs on http://localhost:4000
```

### Other commands

```bash
npm run build         # compile TypeScript → dist/
npm run start         # run compiled build
npm run db:migrate    # create a named migration
npm run db:studio     # open Prisma Studio (visual DB browser)
```

## API Reference

All routes except `/api/auth/login` and `/api/auth/register` require:
```
Authorization: Bearer <token>
```

Routes marked **[admin]** additionally require the user role to be `admin`.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns JWT token |
| POST | `/api/auth/register` | Register new admin user |

### Members [admin]

| Method | Path | Description |
|---|---|---|
| GET | `/api/members` | List all members with payment status |
| GET | `/api/members/:id` | Member details with memberships & progress |
| POST | `/api/members` | Create member (auto-generates MemberNo, creates login) |
| PUT | `/api/members/:id` | Update member + emergency contacts |
| DELETE | `/api/members/:id` | Soft-resign member (sets status = Resigned) |

### Plans [admin]

| Method | Path | Description |
|---|---|---|
| GET | `/api/plans` | List all plans |
| POST | `/api/plans` | Create plan |
| PUT | `/api/plans/:id` | Update plan |
| DELETE | `/api/plans/:id` | Delete plan |

### Memberships

| Method | Path | Description |
|---|---|---|
| GET | `/api/memberships` | List all [admin] |
| GET | `/api/memberships/member/:memberId` | Member's own memberships |
| POST | `/api/memberships` | Assign membership to member [admin] |
| PUT | `/api/memberships/:id` | Update membership [admin] |
| DELETE | `/api/memberships/:id` | Delete membership [admin] |
| POST | `/api/memberships/:id/payments` | Add payment (balance-validated) [admin] |
| GET | `/api/memberships/:id/payments` | List payments |
| POST | `/api/memberships/calculate-end-date` | Calculate end date from plan + start date |

### Attendance

| Method | Path | Description |
|---|---|---|
| GET | `/api/attendance?date=YYYY-MM-DD` | Daily attendance log [admin] |
| POST | `/api/attendance/check-in` | Manual check-in |
| POST | `/api/attendance/check-out` | Manual check-out |
| POST | `/api/attendance/qr` | QR-based check-in/out (validates 2-min expiry) |

### Body Progress

| Method | Path | Description |
|---|---|---|
| GET | `/api/body-progress/member/:memberId` | Progress history |
| POST | `/api/body-progress` | Add record [admin] |
| PUT | `/api/body-progress/:id` | Update record [admin] |
| DELETE | `/api/body-progress/:id` | Delete record [admin] |

### Dashboard [admin]

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Returns totalMembers, activeMembers, activeSubscriptions, todayAttendance, expiringIn7Days, monthlyRevenue |

### Reports [admin]

| Method | Path | Description |
|---|---|---|
| GET | `/api/reports/memberships` | Membership report with Active/Due/Expired summary |
| GET | `/api/reports/memberships/csv` | Download membership report as CSV |
| GET | `/api/reports/revenue?year=&month=` | Monthly revenue breakdown by day |

## Deployment (Railway)

1. Push this folder to a GitHub repo
2. Create a new Railway project → **Deploy from GitHub**
3. Add all environment variables from `.env.example`
4. Railway auto-detects Node.js and runs `npm run build && npm start`

## Default Member Password

When a member is created, a login account is auto-created with password **`Gym@123`**. Advise members to change it after first login (password-change endpoint can be added as needed).
