# Local infrastructure

Docker Compose runs the services the apps need in development. The apps themselves run on your machine with `pnpm dev`. Their env defaults already point at these services, so no `.env` file is needed.

```sh
docker compose -f infra/docker-compose.yml up -d --wait   # start and wait until healthy
docker compose -f infra/docker-compose.yml ps             # status
docker compose -f infra/docker-compose.yml logs -f redis  # follow one service's logs
docker compose -f infra/docker-compose.yml down           # stop; data is kept
docker compose -f infra/docker-compose.yml down -v        # stop and delete all data
```

| Service | Stands in for | Address | Credentials |
| --- | --- | --- | --- |
| Postgres 17.11 | Managed Postgres | `localhost:5432`, database `pme` | `pme` / `pme` |
| Redis 7.4.11 | Managed Redis | `localhost:6379` | none |
| SeaweedFS 4.48 (S3 API) | Cloudflare R2 ([decision 008](../docs/decisions/008-seaweedfs-local-storage.md)) | `http://localhost:8333`; filer UI `http://localhost:8888` | `pme-local-access` / `pme-local-secret`, region `us-east-1` |
| Mailpit 1.31.6 | Resend | SMTP `localhost:1025`; inbox `http://localhost:8025` | none |

- **Buckets:** `pme-public` (gallery images; anyone can read) and `pme-private` (receipts; signed requests only). Both are created on startup. Access rules are in `seaweedfs/s3.json`.
- **Ports** are bound to `127.0.0.1` only, so other machines on your network can't reach them.
- **Data** lives in named Docker volumes (`pme_postgres-data` and the others) and survives `down`; `down -v` deletes it.
- **Redis** runs with `noeviction` and an append-only file, as BullMQ requires: when memory is full, Redis refuses writes instead of silently dropping queued jobs.
- The S3 and SMTP settings reach the apps' env when they start using them: email in milestone 2, uploads in milestone 8.
- All credentials here are local-only and are not secrets. Production values come from env and are never committed.
