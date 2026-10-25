# 17 — Docker images for the apps

Milestone 1, item 9b · Oct 25, 2026

## What happened

`infra/Dockerfile` builds production images for the API, worker and web app, plus a `migrate` image. A compose `app` profile runs them all against the local services:

```sh
docker compose -f infra/docker-compose.yml --profile app up -d --build --wait
```

Migrations ran and exited. The API reported ready, the worker processed its sample job, and the web container served the home page, all as production builds running as an unprivileged user.

## Key ideas

- **Multi-stage builds.** One stage has the full toolchain (pnpm, TypeScript, every dev dependency) and builds everything. Each final stage starts again from a clean Node image and copies in only what that app needs. The toolchain never reaches production.
- **One Dockerfile, several targets.** `--target api`, `worker`, `web` or `migrate` picks the final stage. All four share the same dependency and build layers, so a compose build compiles the monorepo once.
- **Layer order is cache order.** The dependency stage copies only `pnpm-lock.yaml` and `pnpm-workspace.yaml`, then runs `pnpm fetch`. That layer is reused until the lockfile changes, so editing source code doesn't re-download anything. A BuildKit cache mount (`--mount=type=cache`) also keeps the pnpm store between builds.
- **`pnpm deploy`** turns one workspace app into a self-contained folder: its files and production dependencies only, with workspace packages (`@pme/db` and the others) copied in instead of symlinked. It follows the `files` field in `package.json`. Without `"files": ["dist"]` it skipped `dist/`, because `.gitignore` excludes it.
- **Next.js standalone output** traces exactly which files the server needs and writes a minimal `server.js`. Static assets (`.next/static`) and `public/` aren't part of it, so they're copied in next to it.
- **Profiles keep compose flexible.** Services marked `profiles: [app]` only start with `--profile app`. Day to day you run the four services in Docker and the apps with `pnpm dev`. The profile checks the real images.
- **`depends_on` with conditions** sets the start order: `service_completed_successfully` (migrate exited 0), then `service_healthy` (the API passes its health check), then web.
- **Run as non-root.** `USER node`: if an attacker breaks into the process, they aren't root inside the container.

## What testing taught us

- **Check what's inside the image, not just its size.** The first API image was 407 MB. Listing `node_modules` showed TypeScript, webpack and a second copy of ESLint, pulled in because `@pme/config` listed its lint presets as runtime dependencies. Moving them to `devDependencies` brought it to 343 MB. The rest comes from Sentry's bundler plugins, logged as a follow-up.
- **Two servers can share a port number.** The web container bound `127.0.0.1:3000` (IPv4) while a dev server listened on `*:3000` (IPv6). Both started, and `localhost` could reach either one. Testing from inside the container (`docker compose exec web …`) removes the doubt.
- **zsh doesn't split variables into words.** `C="docker compose -f …"; $C ps` fails in zsh. Use a function or an array instead.
- **Slow builds are often the network.** The first full build took over two hours because npm downloads kept timing out. The cache layers mean that cost is paid only when dependencies change.

## Self-check

**Why does the dependency stage copy only the lockfile before running `pnpm fetch`?**
Docker reuses a layer only if its inputs haven't changed. With only the lockfile as input, source edits don't invalidate the download layer.

**What does `pnpm deploy --prod` give you that copying the repo doesn't?**
A folder holding one app with only its production dependencies, and real copies of the workspace packages, so it runs without the rest of the monorepo or pnpm.

**Why is the `migrate` image 1.8 GB, and why is that acceptable?**
It's the full build stage, because `migrate.ts` runs through `tsx` from source. It's only used locally. A slim production migration step is decided with deployment.

**Why can't you run `--profile app` and `pnpm dev` at the same time?**
Both use ports 3000 and 4000. Whichever starts second either fails or, with IPv4 and IPv6 bindings, quietly shares the port, so you can't tell which one answers.

**Why move lint packages to `devDependencies` of `@pme/config` instead of deleting them?**
They're still needed when you run `pnpm lint` in the workspace. pnpm installs dev dependencies for every workspace package locally, but production installs leave them out.

## My notes

<!-- Write your own notes here. -->
