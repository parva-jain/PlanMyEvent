# 001. Separate NestJS API service, Next.js as UI only

- Status: Accepted
- Date: 2026-10-02

## Context

The app needs a REST API, WebSockets for live updates, webhooks (WhatsApp, email, later payments), background jobs, and later a React Native mobile client. The developer is solo, comfortable with Express, and wants the project to show industry-standard backend design.

Options considered:

1. Next.js for both UI and API (route handlers, server actions) plus a small separate worker.
2. A separate API service with Next.js as UI only.

## Decision

Use a separate **NestJS** API service. Next.js only renders pages and calls the API. Background work runs in a separate NestJS worker process. Business logic lives in a framework-free `packages/core`, so the API, worker and future AI/WhatsApp channels share it.

NestJS was chosen over Express or Fastify because its structure maps directly onto the design: modules per feature, guards for permission checks, gateways for Socket.io, and built-in BullMQ integration. It runs on Express underneath, so existing Express knowledge carries over.

## Consequences

- One API serves web and mobile; the mobile app needs no backend changes.
- Socket.io and webhooks live in a long-running server, which serverless hosting doesn't handle well; the API is deployed as a Docker container.
- More code and setup than option 1, and a learning curve for decorators and dependency injection.
- Keeping logic in `packages/core` means the HTTP framework could be swapped later without rewriting domain code.
