# syntax=docker/dockerfile:1

# ── Stage 1: build the static export ────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
# prebuild bundles data/seed → src/seed/seed-data.json; postbuild writes out/sw.js
RUN npm run build

# ── Stage 2: serve it ───────────────────────────────────────────────────────
# The app has no server-side code. Everything lives in the phone's IndexedDB;
# nginx only hands out the files once, and the service worker keeps them.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/manifest.webmanifest > /dev/null || exit 1
