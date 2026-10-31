# Версия Node — ровно та, что в .nvmrc: та же в CI и локально (NODE-VERSION-PIN-01,
# сторож scripts/node-version.test.ts). Плавающий тег node:20-alpine приносил новый
# ICU без ведома проекта — так пришёл час «24:00» (TZ-HOUR-CYCLE-H23). Node 26 — Active
# LTS (поддержка до 30.04.2029), NODE-LTS-UPGRADE.
# ─── Stage 1: Install ALL dependencies ───────────────────────────────────────
FROM node:26.13.0-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:26.13.0-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for the build.
#
# PRISMA-ENGINE-DOWNLOAD (2026-10-31): движок запросов `prisma generate` качает с
# binaries.prisma.sh, а сеть ВМ до него рвётся — деплой упал на этом шаге сборки
# web («Client network socket disconnected before secure TLS connection was
# established»), хотя воркер минутой раньше скачал тот же движок. Две защиты:
#   • кэш BuildKit `prisma-engines`, ОБЩИЙ с Dockerfile.worker (тот же id): движок
#     скачивается один раз на версию Prisma, дальше берётся из кэша со сверкой
#     sha256 без сети — сборка приложения после воркера в сеть не ходит вовсе;
#   • повтор с нарастающей паузой — на случай пустого кэша (новая версия Prisma,
#     чистая ВМ).
# Путь — `~/.cache/prisma` пользователя сборки (root: USER в этой стадии нет).
# Держать в локстепе с Dockerfile.worker — сторож scripts/prisma-engine-download.test.ts.
RUN --mount=type=cache,id=prisma-engines,target=/root/.cache/prisma \
    for attempt in 1 2 3 4 5; do \
      npx prisma generate && exit 0; \
      [ "$attempt" -eq 5 ] && break; \
      echo "prisma generate: попытка $attempt из 5 не удалась, повтор через $((attempt * 15)) с"; \
      sleep $((attempt * 15)); \
    done; \
    echo "prisma generate: 5 попыток не удались — движок Prisma недоступен"; \
    exit 1

# ─── NEXT_PUBLIC_* — baked into the CLIENT bundle at BUILD time ───────────────
# Every var read through src/lib/env.ts `clientEnv` is statically inlined by
# webpack into the browser bundle during `npm run build`. A value provided only
# at runtime (compose `env_file`) NEVER reaches the client. The FULL public set
# must therefore be passed here as --build-arg (wired in deploy.yml). Omitting one
# bakes it EMPTY and the feature is silently dead in the browser regardless of
# .env.production — e.g. the legal ИНН footer (152-ФЗ), the Yandex login button,
# and browser-side error reporting. Keep this list in lockstep with the
# `clientEnv` object in src/lib/env.ts. See docs/DOCKER-READINESS.md (env table).
ARG NEXT_PUBLIC_APP_URL=https://masterryadom.ru
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ARG NEXT_PUBLIC_TELEGRAM_ENABLED=false
ARG NEXT_PUBLIC_VK_ENABLED=false
ARG NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=false
ARG NEXT_PUBLIC_YANDEX_ENABLED=false
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY
ARG NEXT_PUBLIC_LEGAL_INN
ARG NEXT_PUBLIC_VK_COMMUNITY_URL
ARG NEXT_PUBLIC_GLITCHTIP_DSN
ARG NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT=production
ARG NEXT_PUBLIC_GLITCHTIP_RELEASE

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME \
    NEXT_PUBLIC_TELEGRAM_ENABLED=$NEXT_PUBLIC_TELEGRAM_ENABLED \
    NEXT_PUBLIC_VK_ENABLED=$NEXT_PUBLIC_VK_ENABLED \
    NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=$NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED \
    NEXT_PUBLIC_YANDEX_ENABLED=$NEXT_PUBLIC_YANDEX_ENABLED \
    NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY \
    NEXT_PUBLIC_LEGAL_INN=$NEXT_PUBLIC_LEGAL_INN \
    NEXT_PUBLIC_VK_COMMUNITY_URL=$NEXT_PUBLIC_VK_COMMUNITY_URL \
    NEXT_PUBLIC_GLITCHTIP_DSN=$NEXT_PUBLIC_GLITCHTIP_DSN \
    NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT=$NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT \
    NEXT_PUBLIC_GLITCHTIP_RELEASE=$NEXT_PUBLIC_GLITCHTIP_RELEASE \
    NEXT_TELEMETRY_DISABLED=1

# ─── Build-only placeholder server env (throwaway — NEVER in the final image) ─
# `next build` collects page data by EVALUATING every route module. A few server
# modules throw at IMPORT time when their env is absent — notably
# src/lib/prisma-direct.ts (`throw "DIRECT_URL is required for prismaDirect client"`),
# which aborts the whole build. These values exist ONLY to satisfy those
# import-time presence checks: no database or Redis connection is made during the
# build (127.0.0.1 refuses instantly), and because this is a multi-stage build
# NONE of these ENV survive into the `runner` stage — the runner receives the real
# values from .env.production at runtime. Real secrets are never baked in.
# (App-level note: these import-time throws make the app build-hostile; a lazy-init
# refactor is filed as an app finding in docs/DOCKER-READINESS.md — not fixed here.)
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    AUTH_JWT_SECRET="build-only-placeholder-not-used-at-runtime-0000000000000000" \
    OTP_HMAC_SECRET="build-only-placeholder-0000000000000000"

# ─── Heap-кап для сборки на ВМ (CI-DEPLOY-NOREGISTRY-01) ─────────────────────
# Образы собираются на прод-ВМ рядом с работающим приложением; `next build`
# (webpack) — главный потребитель памяти, и без капа его пик определяется
# машиной, а не нами. docker-compose.prod.yml передаёт --max-old-space-size=2048;
# дефолт пустой, чтобы CI-сборка (build-images.yml) и любой ручной `docker build`
# оставались некапленными. ENV стоит ПОСЛЕ prisma generate намеренно — кап
# относится только к `npm run build`.
ARG BUILD_NODE_OPTIONS=""
ENV NODE_OPTIONS=$BUILD_NODE_OPTIONS

RUN npm run build

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:26.13.0-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache libc6-compat \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Public assets — includes sw.js generated by @serwist/next (SEC-07) + sw-push.js
COPY --from=builder /app/public ./public

# Standalone server bundle (minimal node_modules subset included by Next.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static client assets — must sit at .next/static relative to server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
