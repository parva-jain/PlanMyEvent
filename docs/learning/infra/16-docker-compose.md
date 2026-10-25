# 16 — Docker Compose for local services

Milestone 1, item 9a · Oct 25, 2026

## What happened

`infra/docker-compose.yml` now runs the four services the apps depend on: Postgres, Redis, SeaweedFS (S3 storage, standing in for Cloudflare R2) and Mailpit (catches email, standing in for Resend). One command starts them all and waits until each is healthy:

```sh
docker compose -f infra/docker-compose.yml up -d --wait
```

This replaces the two `docker run` commands STATUS used to list. The apps still run on your machine with `pnpm dev`; containerising them is step 9b.

## Key ideas

- **Compose describes a stack, not a container.** Each service gets an image, ports, volumes and a health check. Compose also creates a private network (`pme_default`) where services reach each other by name, for example `postgres:5432`.
- **Pin image tags.** `redis:7` would silently become a different Redis tomorrow. `redis:7.4.11-alpine` only changes when we change it. Each pinned version was released at least 10 days ago, the same caution we use for npm packages.
- **Health checks make `--wait` useful.** A container that's running isn't necessarily ready: Postgres takes a moment before it accepts connections. Each service has a check (`pg_isready`, `redis-cli ping`, an HTTP `/healthz`, `mailpit readyz`). `up --wait` returns only once all of them pass, so a script can run migrations straight after.
- **Named volumes keep data.** Data lives in Docker-managed volumes such as `pme_postgres-data`. `down` removes containers but keeps the volumes. `down -v` deletes them, which is the "start fresh" button.
- **Bind ports to 127.0.0.1.** `5432:5432` would listen on every network interface, so anyone on the same café Wi-Fi could try `pme`/`pme`. `127.0.0.1:5432:5432` only accepts connections from this machine.
- **Redis config follows what BullMQ needs.** By default Redis may evict keys when memory runs out. For a queue, that means jobs quietly vanish. `noeviction` makes Redis refuse writes instead, which is a loud error we can see. The append-only file keeps queued jobs across restarts.
- **Local stand-ins speak the production protocol.** The apps will talk to SeaweedFS through the S3 API and to Mailpit over SMTP. In production the same code talks to R2 and Resend; only env values change.

## What testing taught us

- **Test the access rules, not just "it starts".** Each check should succeed or fail on purpose: a signed upload works; an anonymous read of `pme-public` works (200); an anonymous read of `pme-private`, an anonymous upload and a wrong secret are all refused (403). The last three matter most, because a storage setup that accepts everything also "works".
- **curl can sign S3 requests.** `curl --aws-sigv4 "aws:amz:us-east-1:s3" --user KEY:SECRET` creates the same signature the AWS SDK does, so no extra tools were needed.
- **Check ports before starting.** Compose fails if another process holds 5432, for example the hand-started `pg` container. Look first with `lsof -iTCP:5432 -sTCP:LISTEN` and stop only what you started (lesson from note 15).
- **Prove persistence.** After `down` and `up`, the uploaded file and the Postgres extensions were still there.

## Self-check

**What's the difference between `docker compose down` and `down -v`?**
`down` removes the containers and network but keeps the named volumes, so data survives. `-v` also deletes the volumes and starts fresh.

**Why does Redis need `noeviction` for BullMQ?**
With an eviction policy, Redis deletes keys to free memory. Queue keys are jobs, so jobs would disappear without an error. `noeviction` makes writes fail loudly instead.

**Why is `127.0.0.1:` in front of every port?**
Without it, Docker publishes the port on every network interface, so other machines on the network could reach the database with its local password.

**If the apps talk to SeaweedFS locally, what changes for production?**
Only configuration: the S3 endpoint, credentials and bucket names point at R2. App code uses the same S3 SDK calls.

**Why can't `docker compose up -d` (without `--wait`) be followed directly by `pnpm db:migrate` in a script?**
`up -d` returns as soon as the containers start, before Postgres accepts connections, so the migration could fail. `--wait` blocks until the health checks pass.

## My notes

<!-- Write your own notes here. -->
