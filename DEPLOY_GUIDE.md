# Deployment Guide — МастерРядом

Yandex Cloud VM + Docker Compose + GitHub Actions CI/CD.

---

## Architecture

```
GitHub Actions
  ├── quality (lint, typecheck, tests)
  ├── build   (Docker images → Yandex Container Registry)
  └── deploy  (SSH → pull images → migrate → restart)

Production server (/opt/beautyhub)
  ├── app     (Next.js standalone, port 3000)
  ├── worker  (task queue processor)
  ├── postgres (pgvector/pgvector:pg16)
  └── redis   (redis:7-alpine)

Nginx / reverse proxy → :3000 (managed outside compose)
```

---

## Prerequisites

### Production server
- Ubuntu 22.04 LTS (or compatible)
- Docker 24+ with Docker Compose plugin (`docker compose`)
- Minimum: 2 vCPU, 4 GB RAM, 40 GB SSD

### Install Docker (Ubuntu)
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Yandex Cloud
- Container Registry created (note the registry ID)
- Service account with role `container-registry.images.pusher`
- OAuth token or IAM token for the service account

---

## GitHub Secrets

Configure in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `YC_REGISTRY_ID` | Yandex Container Registry ID (e.g. `crp1a2b3c4d5`) |
| `YC_OAUTH_TOKEN` | OAuth token for Yandex Cloud registry auth |
| `PROD_HOST` | Production server IP or hostname |
| `PROD_USER` | SSH user on the production server |
| `PROD_SSH_KEY` | SSH private key (RSA/Ed25519) |
| `NEXT_PUBLIC_APP_URL` | Public app URL, e.g. `https://beautyhub.art` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key (baked into client bundle) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Telegram bot username |
| `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` | Yandex Maps JS API key |

Optional variables (in Settings → Variables, not Secrets):

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_VK_ENABLED` | `false` |

---

## One-Time Server Setup

```bash
# On the production server as the deploy user
sudo mkdir -p /opt/beautyhub
sudo chown $USER:$USER /opt/beautyhub
cd /opt/beautyhub

# Copy and fill in all production values
cp /path/to/.env.production.example .env.production
nano .env.production          # fill every placeholder

# Copy docker-compose
cp /path/to/docker-compose.prod.yml .

# Start backing services first
REGISTRY=cr.yandex/<your-registry-id> IMAGE_TAG=latest \
  docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d postgres redis

# Wait for postgres to become healthy, then run initial migration
# (use the worker image once it has been pushed by the first CI run)
docker run --rm \
  --env-file .env.production \
  --network beautyhub_internal \
  cr.yandex/<your-registry-id>/beautyhub-worker:latest \
  node_modules/.bin/prisma migrate deploy
```

### Generate VAPID keys (one-time)
```bash
npx web-push generate-vapid-keys
# Copy the output into .env.production and GitHub secrets
```

---

## Deploying

### Automatic (CI/CD)
Push to `main` → quality gates → build images → SSH deploy.

The deploy workflow:
1. Runs `lint`, `typecheck`, `test`
2. Builds and pushes `beautyhub-app` and `beautyhub-worker` to Yandex CR
3. SSHs into the server, pulls new images, runs `prisma migrate deploy`, restarts `app` and `worker` (postgres/redis untouched)

### Manual deploy
```bash
cd /opt/beautyhub

# Set the tag you want to deploy
IMAGE_TAG=a1b2c3d4
REGISTRY=cr.yandex/<registry-id>

echo "$YC_OAUTH_TOKEN" | docker login --username oauth --password-stdin cr.yandex

REGISTRY=$REGISTRY IMAGE_TAG=$IMAGE_TAG \
  docker compose --env-file .env.production -f docker-compose.prod.yml pull app worker

docker run --rm \
  --env-file .env.production \
  --network beautyhub_internal \
  ${REGISTRY}/beautyhub-worker:${IMAGE_TAG} \
  node_modules/.bin/prisma migrate deploy

REGISTRY=$REGISTRY IMAGE_TAG=$IMAGE_TAG \
  docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --no-deps app worker
```

---

## Rollback

```bash
cd /opt/beautyhub
REGISTRY=cr.yandex/<registry-id>
IMAGE_TAG=<previous-short-sha>    # check git log or registry tags

# Note: do NOT run migrate deploy on rollback unless you also wrote a down migration.
REGISTRY=$REGISTRY IMAGE_TAG=$IMAGE_TAG \
  docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --no-deps app worker
```

---

## Useful Commands

```bash
# View live logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f worker

# Check service status
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Open a Prisma Studio against prod DB (read-only exploration)
docker run --rm -it \
  --env-file .env.production \
  --network beautyhub_internal \
  -p 5555:5555 \
  cr.yandex/<registry-id>/beautyhub-worker:latest \
  node_modules/.bin/prisma studio

# Restart a single service
docker compose --env-file .env.production -f docker-compose.prod.yml restart worker

# Flush Redis (careful in prod!)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec redis redis-cli -a "$REDIS_PASSWORD" FLUSHDB
```

---

## Development with Docker

Start only the backing services; run the app locally:

```bash
docker compose -f docker-compose.dev.yml up -d
# postgres available at localhost:5432 (user/pass: beautyhub/beautyhub_dev)
# redis available at localhost:6379 (no password)

npm run dev        # Next.js app
npm run worker     # task queue worker (separate terminal)
```

---

## Nginx (reverse proxy — outside compose)

```nginx
server {
    listen 443 ssl http2;
    server_name beautyhub.art;

    ssl_certificate     /etc/letsencrypt/live/beautyhub.art/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/beautyhub.art/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name beautyhub.art;
    return 301 https://$host$request_uri;
}
```
