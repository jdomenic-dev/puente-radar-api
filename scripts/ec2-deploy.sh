#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy helper for Puente Radar API on EC2
# ─────────────────────────────────────────────────────────────────────────────
# Usage: ./deploy.sh <ecr-image-uri> [aws-region]
# If the region is not provided, it is derived from the ECR image URI.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

IMAGE_URI="${1:?Usage: ./deploy.sh <ecr-image-uri> [aws-region]}"
AWS_REGION="${2:-}"
APP_CONTAINER=puente-radar-api
BACKUP_CONTAINER=puente-radar-api-rollback
ENV_FILE=/home/ec2-user/puente-radar.env
NETWORK=puente-radar-net
REDIS_CONTAINER=puente-radar-redis
REDIS_IMAGE=redis:7-alpine
HAD_PREVIOUS=false

if [ -z "$AWS_REGION" ]; then
  ECR_REGISTRY="${IMAGE_URI%%/*}"
  AWS_REGION="${ECR_REGISTRY#*.dkr.ecr.}"
  AWS_REGION="${AWS_REGION%.amazonaws.com}"
fi

if [ -z "$AWS_REGION" ]; then
  echo "Could not determine AWS region from image URI: $IMAGE_URI" >&2
  exit 1
fi

echo "Deploying image: $IMAGE_URI"
echo "Using AWS region: $AWS_REGION"

if [ ! -s "$ENV_FILE" ]; then
  echo "Deployment environment file is missing or empty: $ENV_FILE" >&2
  exit 1
fi

rollback() {
  echo "New container failed; restoring the previous container." >&2
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
  if [ "$HAD_PREVIOUS" = true ]; then
    if ! docker rename "$BACKUP_CONTAINER" "$APP_CONTAINER" || \
       ! docker start "$APP_CONTAINER"; then
      echo "Automatic rollback failed; previous container remains as $BACKUP_CONTAINER." >&2
      return 1
    fi
  fi
}

# Redis runs next to the API on a private Docker network (no published port, so only the API
# container can reach it). It holds rate-limit counters and the CBP cache, both disposable, so
# there is no persistence. A failure here never blocks a deploy: the API falls back to memory.
ensure_redis() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
  if [ "$(docker inspect -f '{{.State.Running}}' "$REDIS_CONTAINER" 2>/dev/null || true)" = true ]; then
    echo "Redis already running"
    return 0
  fi
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  docker run -d \
    --name "$REDIS_CONTAINER" \
    --restart unless-stopped \
    --network "$NETWORK" \
    --memory 96m \
    "$REDIS_IMAGE" \
    redis-server --maxmemory 64mb --maxmemory-policy volatile-lru --save "" --appendonly no
  sleep 2
  docker exec "$REDIS_CONTAINER" redis-cli ping
}

echo "Ensuring Redis"
if ! ensure_redis; then
  echo "WARNING: Redis is not available; the API will count requests in memory." >&2
fi

# Point the API at Redis unless the env file already sets REDIS_URL.
REDIS_ARGS=()
if ! grep -q '^REDIS_URL=' "$ENV_FILE"; then
  REDIS_ARGS=(-e "REDIS_URL=redis://$REDIS_CONTAINER:6379")
fi

echo "Authenticating to ECR"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${IMAGE_URI%%/*}"

echo "Pulling deployment image"
docker pull "$IMAGE_URI"

echo "Running database migrations"
docker run --rm \
  --env-file "$ENV_FILE" \
  "$IMAGE_URI" \
  pnpm run migration:run:prod

if docker container inspect "$BACKUP_CONTAINER" >/dev/null 2>&1; then
  echo "Refusing to overwrite existing rollback container: $BACKUP_CONTAINER" >&2
  exit 1
fi

if docker container inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  docker rename "$APP_CONTAINER" "$BACKUP_CONTAINER"
  HAD_PREVIOUS=true
  if ! docker stop "$BACKUP_CONTAINER"; then
    rollback || true
    exit 1
  fi
fi

echo "Starting new container"
if ! docker run -d \
  --name "$APP_CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK" \
  -p 127.0.0.1:3000:3000 \
  --env-file "$ENV_FILE" \
  "${REDIS_ARGS[@]}" \
  "$IMAGE_URI"; then
  rollback || true
  exit 1
fi

HEALTHY=false
for attempt in $(seq 1 12); do
  if docker exec "$APP_CONTAINER" node -e \
    "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    HEALTHY=true
    break
  fi
  echo "Health check attempt $attempt/12 failed; retrying in 5 seconds"
  sleep 5
done

if [ "$HEALTHY" != true ]; then
  echo "New container did not become healthy." >&2
  docker logs --tail 100 "$APP_CONTAINER" >&2 || true
  rollback || true
  exit 1
fi

echo "Verifying API-key authentication on a protected endpoint"
if ! docker exec "$APP_CONTAINER" node -e \
  "const key=process.env.ADMIN_API_KEY;if(!key)process.exit(1);fetch('http://127.0.0.1:3000/bridges',{headers:{'x-api-key':key}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "Protected endpoint verification failed." >&2
  rollback || true
  exit 1
fi

if [ "$HAD_PREVIOUS" = true ]; then
  docker rm "$BACKUP_CONTAINER"
fi

echo "Deployment healthy; cleaning up old images"
docker image prune -af --filter "until=168h" || true
