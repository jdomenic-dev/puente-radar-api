#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# EC2 user-data script for Puente Radar API
# ─────────────────────────────────────────────────────────────────────────────
# This script runs once when the EC2 instance boots.
# It installs Docker, AWS CLI, and prepares the environment file path.
#
# Usage:
#   1. Launch an Amazon Linux 2023 t3.micro instance.
#   2. Paste this script into "User data" (advanced options).
#   3. Attach an IAM role with AmazonEC2ContainerRegistryReadOnly.
#   4. After launch, create /home/ec2-user/puente-radar.env with your secrets.
#   5. Optionally attach an Elastic IP so the host address stays fixed.
# ─────────────────────────────────────────────────────────────────────────────

set -e
exec > >(tee /var/log/user-data.log) 2>&1

echo "=== Updating system packages ==="
dnf update -y

echo "=== Installing Docker ==="
dnf install -y docker
systemctl enable docker
systemctl start docker
usermod -aG docker ec2-user

echo "=== Installing AWS CLI ==="
dnf install -y awscli

echo "=== Creating env file placeholder ==="
touch /home/ec2-user/puente-radar.env
chown ec2-user:ec2-user /home/ec2-user/puente-radar.env
chmod 600 /home/ec2-user/puente-radar.env

echo "=== Creating deploy helper script ==="
cat > /home/ec2-user/deploy.sh << 'DEPLOY_EOF'
#!/bin/bash
# Manual deploy helper - usage: ./deploy.sh <image-uri> <aws-region>
set -euo pipefail
IMAGE_URI="${1:?Usage: ./deploy.sh <ecr-image-uri> <aws-region>}"
AWS_REGION="${2:?Usage: ./deploy.sh <ecr-image-uri> <aws-region>}"
APP_CONTAINER=puente-radar-api
BACKUP_CONTAINER=puente-radar-api-rollback
ENV_FILE=/home/ec2-user/puente-radar.env
HAD_PREVIOUS=false

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

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${IMAGE_URI%%/*}"
docker pull "$IMAGE_URI"

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

if ! docker run -d \
  --name "$APP_CONTAINER" \
  --restart unless-stopped \
  -p 80:3000 \
  --env-file "$ENV_FILE" \
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
  docker logs --tail 100 "$APP_CONTAINER" >&2 || true
  rollback || true
  exit 1
fi

if [ "$HAD_PREVIOUS" = true ]; then
  docker rm "$BACKUP_CONTAINER"
fi

docker image prune -af --filter "until=168h" || true
DEPLOY_EOF

chmod +x /home/ec2-user/deploy.sh
chown ec2-user:ec2-user /home/ec2-user/deploy.sh

echo "=== Done ==="
