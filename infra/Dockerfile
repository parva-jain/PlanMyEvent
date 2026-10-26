# One Dockerfile for every app; pick one with --target (api, worker, web, migrate).
# Build from the repository root:
#   docker build -f infra/Dockerfile --target api -t pme-api .

# Node 22.23.4 is a security release (Oct 21, 2026), taken ahead of the usual release-age wait.
ARG NODE_IMAGE=node:22.23.4-alpine3.24

FROM ${NODE_IMAGE} AS base
# Installed with npm because corepack can't launch pnpm 12 (see docs/STATUS.md).
RUN npm install -g pnpm@12.14.0
ENV CI=true
WORKDIR /repo

# Dependencies: only the lockfile and workspace manifests, so this layer is reused until a
# dependency changes, not on every source edit.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm fetch

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm turbo run build --filter=@pme/api --filter=@pme/worker --filter=@pme/web
# A self-contained folder per Node app: its dist plus production dependencies only, with
# workspace packages copied in rather than symlinked.
RUN pnpm deploy --filter=@pme/api --prod --legacy /out/api \
 && pnpm deploy --filter=@pme/worker --prod --legacy /out/worker

# Runs migrations with the full toolchain (tsx); used by compose before the API starts.
FROM build AS migrate
CMD ["pnpm", "db:migrate"]

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/worker ./
USER node
CMD ["node", "dist/main.js"]

# Next.js standalone output: a minimal server with only the files the build traced.
# Static assets and public/ aren't part of it and are copied next to it.
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/web/server.js"]
