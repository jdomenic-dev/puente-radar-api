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
# Manual deploy helper — usage: ./deploy.sh <image-uri>
set -e
IMAGE_URI="${1:?Usage: ./deploy.sh <ecr-image-uri>}"
aws ecr get-login-password --region "$(aws configure get region 2>/dev/null || echo us-east-1)" | \
  docker login --username AWS --password-stdin "${IMAGE_URI%%/*}"
docker pull "$IMAGE_URI"
docker stop puente-radar-api || true
docker rm puente-radar-api || true
docker run -d \
  --name puente-radar-api \
  --restart unless-stopped \
  -p 80:3000 \
  --env-file /home/ec2-user/puente-radar.env \
  "$IMAGE_URI"
docker image prune -af --filter "until=168h" || true
DEPLOY_EOF

chmod +x /home/ec2-user/deploy.sh
chown ec2-user:ec2-user /home/ec2-user/deploy.sh

echo "=== Done ==="
