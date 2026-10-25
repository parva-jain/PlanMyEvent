# Architecture Decision Records

Short records of significant decisions: the context, what was decided, and the consequences. Add a new numbered file when a decision is made or reversed; don't rewrite old ones, mark them "Superseded by NNN" instead.

| # | Decision | Status |
| --- | --- | --- |
| [001](001-nestjs-separate-api.md) | Separate NestJS API service, Next.js as UI only | Accepted |
| [002](002-postgres-over-mongodb.md) | PostgreSQL over MongoDB | Accepted |
| [003](003-transactional-outbox.md) | Transactional outbox for every write | Accepted |
| [004](004-cloudflare-r2-storage.md) | Cloudflare R2 for file storage | Accepted |
| [005](005-job-id-format.md) | Dash-separated deterministic job ids | Accepted |
| [006](006-aa-contrast-tokens.md) | Text colours adjusted to meet WCAG AA | Accepted |
| [007](007-cool-mist-deep-palette.md) | Cool "Mist Deep" neutrals replace the warm palette | Accepted |
| [008](008-seaweedfs-local-storage.md) | SeaweedFS replaces MinIO as the local S3 stand-in | Accepted |

Template:

```markdown
# NNN. Title

- Status: Proposed | Accepted | Superseded by NNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```
