# syntax=docker/dockerfile:1

# ── Stage 1: build the static export ────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# --prod: the build needs next, react, typescript and the types, not the test tools.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --prod
COPY . .
# build: gen-seed picks the farm (private/ if copied in, else the sample), then next build, then out/sw.js
RUN pnpm run build

# ── Stage 2: serve it ───────────────────────────────────────────────────────
# The app has no server-side code. Everything lives in the phone's IndexedDB;
# nginx only hands out the files once, and the service worker keeps them.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/manifest.webmanifest > /dev/null || exit 1
