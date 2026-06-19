# Puente Radar — Backend API

NestJS REST API for real-time border crossing wait-time reporting.

## Stack

- **NestJS 11** + TypeScript 5.7 (`module: nodenext`)
- **TypeORM 0.3** + PostgreSQL 16
- **Swagger** served at `/api/docs`
- **class-validator** + **class-transformer** for DTO validation

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your local values (defaults work with docker-compose below)
```

### 3. Start PostgreSQL via Docker

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on port `5432` with:
- database: `puente_radar`
- user: `postgres`
- password: `postgres`

### 4. Run the API (development)

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`.

### 5. Seed bridges

```bash
npm run build
npm run seed
```

This inserts 4 border bridges idempotently (safe to run multiple times):
- Puente Libre / Córdova-Américas
- Puente Santa Fe
- Puente Zaragoza / Ysleta
- Puente Guadalupe-Tornillo

### 6. Open Swagger UI

```
http://localhost:3000/api/docs
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | API listen port |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `DATABASE_USER` | `postgres` | DB user |
| `DATABASE_PASSWORD` | `postgres` | DB password |
| `DATABASE_NAME` | `puente_radar` | Database name |
| `DATABASE_SYNC` | `true` | Auto-sync schema (dev only) |
| `DATABASE_LOGGING` | `true` | Log SQL queries |
| `CORS_ORIGIN` | `http://localhost:3001` | Allowed CORS origin |

> **Production**: Set `DATABASE_SYNC=false` and use TypeORM migrations instead.

---

## Available Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/bridges` | List all bridges |
| `GET` | `/bridges/summary` | Home summary (bridge status + recent report count) |
| `GET` | `/bridges/slug/:slug` | Bridge detail by slug |
| `GET` | `/bridges/:id` | Bridge detail by UUID |
| `PATCH` | `/bridges/:id/status` | Update bridge status / wait / trend |
| `POST` | `/reports` | Submit an anonymous crossing report |
| `GET` | `/reports` | List reports (optional `?bridgeId=&limit=`) |
| `GET` | `/reports/summary/home` | Home summary (delegates to bridges summary) |
| `GET` | `/reports/bridge/:bridgeId/recent` | Recent reports for a bridge (default limit 10) |
| `GET` | `/api/docs` | Swagger UI |

---

## Running Tests

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# E2E tests — Option A: Docker Desktop (recommended)
docker compose up -d
npm run test:e2e

# E2E tests — Option B: Local Postgres (if Docker is unavailable)
# Ensure the DB and role exist, then pass credentials as env vars:
DATABASE_USER=<user> DATABASE_PASSWORD=<pass> DATABASE_NAME=puente_radar \
  DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_SYNC=true \
  DATABASE_LOGGING=false NODE_ENV=test npm run test:e2e -- --runInBand
```

> `DATABASE_SYNC=true` lets TypeORM auto-create the schema on first run.
> In CI, set `DATABASE_SYNC=false` and use migrations instead.

---

## Project Structure

```
backend/
├── src/
│   ├── app.module.ts              # Root module
│   ├── main.ts                    # Bootstrap (ValidationPipe, CORS, Swagger)
│   ├── config/
│   │   ├── env.validation.ts      # class-validator env schema
│   │   └── typeorm.config.ts      # TypeORM async factory
│   ├── common/enums/
│   │   ├── bridge.enum.ts         # BridgeStatus, WaitTrend
│   │   └── report.enum.ts         # ReportSource, ReportStatus
│   ├── modules/
│   │   ├── bridges/               # Bridge entity, DTOs, service, controller
│   │   ├── reports/               # Report entity, DTOs, service, controller
│   │   ├── health/                # GET /health
│   │   └── auth/                  # Placeholder auth module
│   └── database/
│       └── seed.ts                # Idempotent bridge seed script
├── test/
│   └── app.e2e-spec.ts            # E2E test suite
├── .env.example                   # Environment variable template
├── docker-compose.yml             # Local PostgreSQL service
└── README.md
```
