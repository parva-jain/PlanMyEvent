# 008. SeaweedFS replaces MinIO as the local S3 stand-in

- Status: Accepted
- Date: 2026-10-25

## Context

Decision 004 picked Cloudflare R2 for file storage, with MinIO standing in for R2 locally. In October 2025 MinIO stopped publishing community Docker images and later archived its community repository. A pinned old image would keep working, but it would never get security fixes, and new contributors would be starting on an abandoned project.

Local storage only needs to speak the S3 API well enough for the AWS SDK: buckets, signed requests, presigned URLs, anonymous reads on a public bucket, and data that survives a restart.

## Decision

Use **SeaweedFS** (`chrislusf/seaweedfs`, pinned version) in `infra/docker-compose.yml`, running `weed mini`. That one process runs SeaweedFS's master, volume, filer and S3 gateway. It creates the `pme-public` and `pme-private` buckets on startup. Access is defined in `infra/seaweedfs/s3.json`: one local identity with full access, and anonymous read on `pme-public` only.

Production still uses R2 (decision 004 is unchanged). The apps only see an S3 endpoint, credentials and bucket names from env, so switching between the two is configuration.

## Alternatives considered

- **Old MinIO image, pinned.** Works today, but gets no fixes.
- **Garage.** S3-compatible and maintained, but buckets and keys are created with CLI commands after startup, so compose needs an extra init container.
- **LocalStack.** Emulates many AWS services. It is heavier than needed, and its free edition is limited.
- **A real R2 bucket for development.** Needs network access and a Cloudflare account for every contributor, and test data would mix with real storage.

## Consequences

- One container, and no separate step to create buckets.
- SeaweedFS's S3 support covers what we use, though not every S3 feature. Upload code is checked against R2 in staging before launch.
- Public-bucket access is set in SeaweedFS's identity file, while R2 uses bucket settings. Only the setup differs; app code is the same.
- Verified Oct 25, 2026: signed list, put and get; anonymous get on `pme-public` (200) and refused on `pme-private` (403); anonymous put and a wrong secret refused (403); files kept after `down` and `up`.
