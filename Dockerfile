# syntax=docker/dockerfile:1

FROM node:22-slim

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      chromium \
      curl \
      ffmpeg \
      fonts-liberation \
      python3 \
      python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages yt-dlp curl_cffi

ARG BUN_VERSION=1.3.14
RUN npm install --global bun@${BUN_VERSION}

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile \
 && bunx prisma generate

COPY mini-services/tiktok-comments/package.json mini-services/tiktok-comments/bun.lock ./mini-services/tiktok-comments/
WORKDIR /app/mini-services/tiktok-comments
RUN bun install --frozen-lockfile

WORKDIR /app
COPY . .

RUN bun run build

RUN mkdir -p /app/cache/videos /app/db /app/scripts
COPY scripts/docker-entrypoint.sh /app/scripts/docker-entrypoint.sh
RUN chmod 0755 /app/scripts/docker-entrypoint.sh

ENV NODE_ENV=production \
    DATABASE_URL=file:/app/db/custom.db \
    TIKTOK_CACHE_DIR=/app/cache/videos \
    DEMO_MODE=true \
    TIKTOK_CACHE_TTL_MIN=10 \
    TIKTOK_SOCKET_TIMEOUT=30 \
    TIKTOK_RETRIES=3 \
    TIKTOK_PROXY= \
    DATA_MODE=local \
    HOSTNAME=0.0.0.0 \
    PORT=3000

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
