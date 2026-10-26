# 18 — Continuous integration

Milestone 1, item 10 · Oct 26, 2026

## What happened

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. It has two jobs, which run in parallel on GitHub's Ubuntu machines:

| Job | Steps |
| --- | --- |
| `verify` | Install; format check; lint; typecheck; unit tests; build; run migrations twice; `drizzle-kit check`; confirm the schema needs no new migration; start the built API and worker against Postgres and Redis and check readiness and the sample job |
| `e2e` | Install; install Chromium; the 16 Playwright smoke tests against a production build. On failure, the HTML report is uploaded |

Every step was first run locally against the compose services, and all passed.

## Key ideas

- **CI is the referee.** Husky hooks only run on your machine and can be skipped. CI runs the same checks on a clean machine for every change, so `main` only gets code that passed.
- **Service containers.** `services:` starts Postgres and Redis next to the job, using the same images and credentials as `infra/docker-compose.yml`. The apps' local defaults (`localhost:5432`, `pme`/`pme`) work unchanged, with no CI-only config.
- **Install cache.** `setup-node` with `cache: pnpm` saves the pnpm store, keyed by `pnpm-lock.yaml`. Later runs reuse the downloads until the lockfile changes, which is the same idea as the Docker dependency layer.
- **Pin actions to commit SHAs.** `uses: actions/checkout@v7` follows a tag, and tags can be moved, so a compromised action could change what runs with access to your code. A full SHA can't change. The comment next to it says which release it is.
- **Least privilege.** `permissions: contents: read` means the workflow's token can read the repository but not push, comment or publish.
- **Check that migrations match the schema.** If someone edits the Drizzle schema but forgets `pnpm db:generate`, the code and the database drift apart. CI runs `db:generate` and fails if it creates any files. Running migrations twice also proves they're safe to re-run.
- **Smoke-test the build output.** Compiling isn't the same as running. Starting `dist/main.js` catches missing files, wrong env handling and broken imports that only show up at startup.
- **`concurrency` with `cancel-in-progress`.** Pushing again while CI is still running cancels the old run, which saves minutes and gives faster feedback.

## What testing taught us

- **Run CI steps locally first.** Each step ran locally against the compose services, so the first CI run checks the environment, not our code.
- **Which events trigger a workflow matters.** With `on: pull_request` and `push: main`, pushing a feature branch on its own runs nothing. CI starts when the pull request is opened.
- **Scan history before the first push to a public repo.** Once pushed, everything in history is public, including a file deleted in a later commit. The history was searched for API keys, tokens, private keys and `.env` files before pushing.

## Self-check

**Why are actions pinned to a SHA instead of `@v7`?**
A tag can be moved to point at different code; a commit SHA can't. Pinning means the workflow runs exactly the code that was reviewed.

**What would the "schema and migrations in sync" step catch?**
A schema change committed without its generated migration. Locally everything might work if you ran `drizzle-kit push`, but production migrations wouldn't create the column.

**Why start the API in CI if the tests already passed?**
Unit tests don't start the app. The smoke step proves the built output boots, reads its env and connects to Postgres and Redis.

**Why do the CI services use the same credentials as compose?**
The apps' development defaults already point at them, so CI needs no extra env and tests the same configuration you use locally.

## My notes

<!-- Write your own notes here. -->
