# Learning notes

One note per working step (per feature since Oct 26): what was built, the key ideas, what testing taught us, and self-check questions. Notes are grouped into three folders; the number is the order they were written in, so reading them in number order follows the build.

## Backend

API, worker, database and the shared packages behind them.

- [02 Contracts and the database](backend/02-contracts-and-database.md)
- [03 The action pattern](backend/03-action-pattern.md)
- [04 One request through the API](backend/04-api-request-flow.md)
- [05 Errors, logging, shutdown](backend/05-errors-logging-shutdown.md)
- [06 Queues and BullMQ](backend/06-queues-and-bullmq.md)
- [07 The worker app](backend/07-worker-app.md)
- [19 Unit tests](backend/19-unit-tests.md)
- [20 API tests](backend/20-api-tests.md)
- [22 Sign-in and the outbox](backend/22-sign-in-and-outbox.md)
- [24 Events, versions and retries](backend/24-events-versions-retries.md)
- [26 Members, roles and permissions](backend/26-members-roles-permissions.md)
- [28 Fixing what the reviews found](backend/28-review-fixes.md)
- [29 The activity log and undo](backend/29-activity-log-undo.md)
- [30 Live updates](backend/30-live-updates.md)

## Frontend

The web app: foundation, motion, UI components and the home page.

- [08 Web foundation](frontend/08-web-foundation.md)
- [09 Motion tokens and provider](frontend/09-motion-tokens-and-provider.md)
- [10 Motion components](frontend/10-motion-components.md)
- [11 Base UI components](frontend/11-base-ui-components.md)
- [12 Home page: header and hero](frontend/12-home-header-hero.md)
- [13 Scroll-linked motion](frontend/13-scroll-linked-motion.md)
- [14 Home page complete (and a palette change)](frontend/14-home-page-complete.md)
- [15 Smoke tests and Lighthouse](frontend/15-smoke-tests-and-lighthouse.md)
- [21 App shell](frontend/21-app-shell.md)
- [23 Sign-in screens](frontend/23-sign-in-screens.md)
- [25 Events in the web app](frontend/25-events-web.md)
- [27 The team in the web app](frontend/27-team-web.md)
- [31 Live screens and undo in the web app](frontend/31-live-web.md)

## Infra

Repository tooling, Docker, CI and deployment.

- [01 Monorepo basics](infra/01-monorepo-basics.md)
- [16 Docker Compose for local services](infra/16-docker-compose.md)
- [17 Docker images for the apps](infra/17-docker-images.md)
- [18 Continuous integration](infra/18-continuous-integration.md)

New notes keep the next number and go in the folder that matches their topic.
