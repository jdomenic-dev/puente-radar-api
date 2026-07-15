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

> **Staging and production**: Set `DATABASE_SYNC=false`. The EC2 deployment runs
> pending migrations from the exact ECR image before replacing the API.
> `ADMIN_API_KEY` and `CORS_ORIGIN` are required in production.

---

## Available Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | API and database readiness check |
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
3. **Deploy**: pulls the exact image on EC2, runs its migrations, replaces the container, and verifies `/health`.

Pushes to `staging` use the `staging` GitHub environment and
`EC2_INSTANCE_ID_STAGING`; pushes to `main` use `production` and
`EC2_INSTANCE_ID_PROD`. GitHub Actions sends the deployment command through
AWS Systems Manager, so deploys do not require inbound SSH access. Keep
separate EC2 env files and databases for the two environments. Each host reads
runtime secrets from `/home/ec2-user/puente-radar.env`.

Migration failure leaves the running container untouched. After migrations,
the old container is retained as `puente-radar-api-rollback` until the new
container passes the bounded health-check loop. A startup or health failure
restores the old container name and starts it again.

Rollback only covers the application container. Applied database migrations
remain in place, so production migrations must stay backward-compatible with
the previously deployed image. If a failed rollback leaves
`puente-radar-api-rollback` behind, inspect and recover that container before
running another deployment; CI will not overwrite it.

### Required GitHub secrets

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS IAM user access key (push to ECR and invoke SSM) |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key |
| `AWS_REGION` | AWS region, e.g. `us-east-1` |
| `ECR_REPOSITORY` | Name of the ECR repository |
| `EC2_INSTANCE_ID_PROD` | Production EC2 instance ID |
| `EC2_INSTANCE_ID_STAGING` | Staging EC2 instance ID |

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
   - Public access: **No**.
   - Security group: allow inbound PostgreSQL (port 5432) only from the matching EC2 instance security group.
   - Save the endpoint, username, and password.

3. **(Optional) Create an ElastiCache Redis cluster** if you want caching. Otherwise leave `REDIS_URL` unset.

4. **Create the EC2 instance**:
   - AMI: **Amazon Linux 2023**.
   - Instance type: `t3.micro` (free tier eligible).
   - IAM role: attach `AmazonEC2ContainerRegistryReadOnly` and `AmazonSSMManagedEC2InstanceDefaultPolicy`.
   - Security group: allow HTTP (port 80) from anywhere. SSH (port 22) is optional and should be restricted to your IP for manual administration only.
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
     - An inline policy that allows `ssm:SendCommand` only for the target EC2 instance and `AWS-RunShellScript`, plus `ssm:GetCommandInvocation`.
   - Generate access key / secret and add them as GitHub secrets.

7. **Deploy once, then seed the database** (run once per fresh staging/production database on EC2):

   The first deployment creates the complete schema by running the baseline and
   estimates migrations. Then seed the six bridge records idempotently with the
   same image and environment file:

   ```bash
   docker run --rm \
     --env-file /home/ec2-user/puente-radar.env \
     <ecr-image-uri> \
     pnpm run seed
   ```

### Manual deploy (optional)

If you ever want to deploy manually from the EC2 instance:

```bash
./deploy.sh <ecr-image-uri> <aws-region>
```

The region is mandatory; the helper does not depend on an AWS CLI default.
It uses the same migrate-before-replace, health-check, and rollback sequence as CI.

### Manual migration run

If you ever need to run migrations manually against RDS:

```bash
docker run --rm \
  --env-file /home/ec2-user/puente-radar.env \
  <ecr-image-uri> \
  pnpm run migration:run:prod
```
