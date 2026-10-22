# 002. PostgreSQL over MongoDB

- Status: Accepted
- Date: 2026-10-02

## Context

The data model is highly relational: attendance links households to events or sub-events, households contain contacts, role assignments link members to roles with scopes, expenses link to categories, sub-events, vendors and members. Most screens join several of these. Some parts are flexible: template settings and custom RSVP/registration answers.

## Decision

Use **PostgreSQL** with Drizzle ORM. Use JSONB columns only for flexible data (settings, form answers), never for fields the app filters on.

## Rationale

| Need | PostgreSQL | MongoDB |
| --- | --- | --- |
| Joins (headcounts, budget by category, effective permissions) | Natural and fast | `$lookup` is clumsier; data often duplicated instead |
| Integrity (no orphan rows) | Foreign keys | Enforced in application code |
| Uniqueness (token hashes, transaction refs, one attendance row per guest) | Unique and partial constraints | Harder across documents |
| All-or-nothing multi-row changes (outbox, AI quick updates) | Mature transactions | Supported, less central |
| Reports | SQL `GROUP BY` | Aggregation pipelines |
| Flexible fields | JSONB, indexable | Native |

## Consequences

- Schema changes need migrations (managed with Drizzle).
- The transactional outbox (ADR 003) relies on Postgres transactions and `SKIP LOCKED`.
- SQL is also the more widely expected skill for the portfolio.
