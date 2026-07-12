# syntax=docker/dockerfile:1
#
# libcut — self-hosted, tracking-free TikTok viewer.
# Next.js 16 + Prisma (SQLite) + yt-dlp + ffmpeg. ALL TikTok traffic goes
# through a SOCKS5 proxy (TIKTOK_PROXY) at the yt-dlp layer.
#
# Also installs Chromium for the optional tiktok-comments mini-service
# (headless browser needed for TikTok's a_bogus API signing).

FROM node:20-slim

# --- System dependencies -----------------------------------------------------
# python3 + pip   -> yt-dlp
# ffmpeg          -> media mux/transcode used by yt-dlp
# chromium deps   -> shared libraries for puppeteer's headless chrome
# ca-certificates -> TLS for pip / yt-dlp / node fetches
# curl            -> useful for debugging inside the container
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      ffmpeg \
      ca-certificates \
      curl \
      wget \
      gnupg \
      fonts-liberation \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
 && rm -rf /var/lib/apt/lists/*

# --- yt-dlp + impersonation --------------------------------------------------
# curl_cffi is REQUIRED for TikTok — yt-dlp uses it to impersonate a real
# browser TLS fingerprint, without which TikTok blocks extraction with
# "Unexpected response from webpage request".
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp curl_cffi

# --- bun ---------------------------------------------------------------------
RUN npm install -g bun

WORKDIR /app

# Copy dependency manifests first for better layer caching.
COPY package.json bun.lock ./
COPY prisma ./prisma

RUN bun install --frozen-lockfile \
 && bunx prisma generate

# Copy the rest of the source (next.config.ts, src/, public/, tsconfig, ...).
COPY . .

# Build the Next.js app.
RUN bun run build

# --- tiktok-comments mini-service -------------------------------------------
# Install its deps + download Chromium for puppeteer (comments need a head
# less browser to accept TikTok's GDPR consent + click the comment icon).
WORKDIR /app/mini-services/tiktok-comments
RUN bun install \
 && bun x puppeteer browsers install chrome
# Resolve the installed chrome path and set it for puppeteer.
RUN CHROME_PATH=$(find /root/.cache/puppeteer -name chrome -type f | head -1) \
 && echo "PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH" \
 && echo "$CHROME_PATH" > /tmp/chrome_path
WORKDIR /app

# Runtime directories (mounted as named volumes in docker-compose.yml).
RUN mkdir -p /app/cache/videos /app/db

# --- Default environment (overridable via docker-compose / .env) -------------
ENV NODE_ENV=production \
    DATABASE_URL=file:/app/db/custom.db \
    TIKTOK_CACHE_DIR=/app/cache/videos \
    DEMO_MODE=false \
    TIKTOK_CACHE_TTL_MIN=10 \
    TIKTOK_SOCKET_TIMEOUT=30 \
    TIKTOK_RETRIES=3 \
    TIKTOK_PROXY= \
    DATA_MODE=local \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 3000 3040

# Start both the comments service (background) and the Next.js app.
# The comments service needs PUPPETEER_EXECUTABLE_PATH to find Chromium.
CMD ["sh", "-c", "export PUPPETEER_EXECUTABLE_PATH=$(cat /tmp/chrome_path 2>/dev/null || echo /root/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome) && cd /app/mini-services/tiktok-comments && (bun run index.ts &) && cd /app && bunx prisma db push --skip-generate && exec ./node_modules/.bin/next start -p 3000 -H 0.0.0.0"]
