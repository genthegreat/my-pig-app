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

# The one runtime dependency (password-reset mail), copied out of pnpm's
# symlinked store as plain files.
RUN mkdir -p /runtime/node_modules && cp -rL node_modules/nodemailer /runtime/node_modules/nodemailer

# ── Stage 2: serve it ───────────────────────────────────────────────────────
# A small Node server: it hands out the export, and keeps the accounts and
# sessions that decide who may have it (server/). Farm data itself still
# lives in the phone's IndexedDB; the only state here is /data/auth.json.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 AUTH_DATA_FILE=/data/auth.json
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /app/out ./out
COPY server ./server
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/manifest.webmanifest > /dev/null || exit 1
CMD ["node", "server/index.mjs"]
