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
| `ADMIN_API_KEY` | `change-me-in-production` | Static key for admin endpoints |
| `JSON_BODY_LIMIT` | `50kb` | Max JSON body size |
| `REDIS_URL` | — | Optional Redis connection URL |
| `THROTTLE_TTL_MS` | `60000` | Rate-limit window |
| `THROTTLE_LIMIT` | `60` | Max requests per window |
| `THROTTLE_REPORTS_LIMIT` | `5` | Max `POST /reports` per minute |
| `CBP_BASE_URL` | `https://bwt.cbp.gov/api/waittimes` | CBP wait-times endpoint |

> **Production**: Set `DATABASE_SYNC=false` and use TypeORM migrations instead.
> **Production**: `ADMIN_API_KEY` and `CORS_ORIGIN` are required.

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
├── docker-compose.yml             # Local PostgreSQL + Redis service
├── docker-compose.prod.yml        # Production-like local stack
├── Dockerfile                     # Multi-stage production image
├── .github/workflows/ci-cd.yml    # GitHub Actions CI/CD
├── scripts/
│   └── ec2-user-data.sh           # EC2 bootstrap script
└── README.md
```

---

## Security Hardening

The API includes the following security measures:

- **Helmet** — security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.).
- **CORS** — origin restricted in production; `*` is rejected when `NODE_ENV=production`.
- **Rate limiting** — global throttle + stricter limit on `POST /reports`.
- **Admin API key** — admin endpoints require the `x-api-key` header.
- **Body size limit** — JSON payloads capped at `JSON_BODY_LIMIT` (default `50kb`).
- **Validation** — DTOs use `whitelist` + `forbidNonWhitelisted` to reject unknown fields.
- **Production DB safety** — `synchronize` is forced to `false` in production.
- **Swagger disabled in production** — docs only available in development/test.

---

## Docker

### Build the production image

```bash
docker build -t puente-radar-api .
```

### Run a production-like stack locally

```bash
# Generate a secure admin key first
export ADMIN_API_KEY=$(openssl rand -hex 32)

docker compose -f docker-compose.prod.yml up -d
```

This builds the production image, runs PostgreSQL + Redis, and executes TypeORM migrations before starting the API.

---

## CI / CD with GitHub Actions

The workflow in `.github/workflows/ci-cd.yml` runs on every push / PR to `main` or `staging`:

1. **CI**: install dependencies → lint → build → unit tests.
2. **Build & push**: builds a Docker image and pushes it to **Amazon ECR**.
3. **Deploy**: connects via SSH to the EC2 instance, pulls the image, and restarts the container.

### Required GitHub secrets

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS IAM user access key (push to ECR) |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key |
| `AWS_REGION` | AWS region, e.g. `us-east-1` |
| `ECR_REPOSITORY` | Name of the ECR repository |
| `EC2_HOST_PROD` | Public IP or DNS of the production EC2 instance |
| `EC2_HOST_STAGING` | Public IP or DNS of the staging EC2 instance |
| `EC2_USERNAME` | SSH username, e.g. `ec2-user` |
| `EC2_SSH_KEY` | PEM private key content (full text) |

---

## Deploy to AWS (EC2 + RDS)

Recommended architecture for the MVP:

- **Amazon EC2** (`t3.micro` free tier) — runs the Docker container.
- **Amazon RDS PostgreSQL** (`db.t3.micro`) — managed database.
- **Amazon ECR** — stores the Docker image.
- **Amazon ElastiCache Redis** (optional) — the app works without Redis, so this can be added later.

### One-time AWS setup

1. **Create an ECR repository**:
   ```bash
   aws ecr create-repository --repository-name puente-radar-api
   ```

2. **Create an RDS PostgreSQL instance**:
   - Engine: PostgreSQL 16.
   - Tier: `db.t3.micro` (eligible for free tier).
   - Public access: **Yes** for the MVP (restrict via security group).
   - Security group: allow inbound PostgreSQL (port 5432) only from the EC2 instance security group and your IP.
   - Save the endpoint, username, and password.

3. **(Optional) Create an ElastiCache Redis cluster** if you want caching. Otherwise leave `REDIS_URL` unset.

4. **Create the EC2 instance**:
   - AMI: **Amazon Linux 2023**.
   - Instance type: `t3.micro` (free tier eligible).
   - IAM role: attach a role with `AmazonEC2ContainerRegistryReadOnly`.
   - Security group: allow inbound SSH (port 22) from your IP, and HTTP (port 80) from anywhere.
   - User data: paste the contents of `scripts/ec2-user-data.sh`.
   - Allocate an **Elastic IP** and associate it to the instance so the address does not change.

5. **Create the environment file on EC2**:

   SSH into the instance and create `/home/ec2-user/puente-radar.env`:

   ```bash
   sudo nano /home/ec2-user/puente-radar.env
   ```

   Content:

   ```env
   NODE_ENV=production
   PORT=3000
   DATABASE_HOST=<rds-endpoint>
   DATABASE_PORT=5432
   DATABASE_USER=<rds-user>
   DATABASE_PASSWORD=<rds-password>
   DATABASE_NAME=puente_radar
   DATABASE_SYNC=false
   DATABASE_LOGGING=false
   CORS_ORIGIN=https://your-expo-app-url.expo.app
   ADMIN_API_KEY=<generate with openssl rand -hex 32>
   REDIS_URL=redis://<elasticache-endpoint>:6379
   ```

   Set permissions:
   ```bash
   chmod 600 /home/ec2-user/puente-radar.env
   ```

6. **Create an IAM user for GitHub Actions**:
   - Attach policies:
     - `AmazonEC2ContainerRegistryFullAccess` (push to ECR)
   - Generate access key / secret and add them as GitHub secrets.

7. **Seed the database** (run once against RDS):
   ```bash
   DATABASE_HOST=<rds-endpoint> \
   DATABASE_USER=<rds-user> \
   DATABASE_PASSWORD=<rds-password> \
   DATABASE_NAME=puente_radar \
   NODE_ENV=production \
   pnpm run build && pnpm run seed
   ```

### Manual deploy (optional)

If you ever want to deploy manually from the EC2 instance:

```bash
./deploy.sh <ecr-image-uri>
```

### Manual migration run

If you ever need to run migrations manually against RDS:

```bash
DATABASE_HOST=<rds-endpoint> \
DATABASE_USER=<rds-user> \
DATABASE_PASSWORD=<rds-password> \
DATABASE_NAME=puente_radar \
NODE_ENV=production \
pnpm run migration:run:prod
```
