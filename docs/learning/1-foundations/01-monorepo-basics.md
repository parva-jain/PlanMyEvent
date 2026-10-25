# 01 — Monorepo basics

Session A · milestone 1, items 1–2 · Oct 22, 2026

## Key ideas

- **One repo, shared packages.** `apps/` run, `packages/` are shared. Web and API import the same `@pme/contracts`, so a mismatch becomes a compile error instead of a production bug.
- **pnpm workspaces.** `pnpm-workspace.yaml` lists the package folders; `"workspace:*"` links a local package instead of downloading it. pnpm is strict: a package can only import what its own `package.json` lists.
- **Supply-chain guards.** `allowBuilds` decides which packages may run install scripts; `minimumReleaseAge` refuses versions published in the last day.
- **Turborepo.** `"dependsOn": ["^build"]` means "build my dependencies first". Turbo hashes inputs and replays cached outputs when nothing changed.
- **Packages compile to `dist/`.** Node can't run another package's `.ts` at runtime; `exports` in `package.json` points to the built JS and `.d.ts`.
- **tsconfig chain.** `base → node → library / nest`, and `base → nextjs`. Strict flags like `noUncheckedIndexedAccess` catch real crashes.
- **Three tools, three jobs.** Prettier formats, ESLint finds bugs (type-aware), Husky + lint-staged run both before each commit.
- **Fail fast on env.** `defineEnv` validates every variable at startup. `devDefault` gives local defaults in development only, never in production.

## Self-check

**What does the `^` in `^build` mean, and what breaks without it?**
It means "run `build` in my dependencies first". Without it, Turbo could build `@pme/api` before `@pme/contracts` has a `dist/`, so imports fail with "cannot find module" or missing types.

**Why does pnpm need `allowBuilds`, and what attack does it prevent?**
Install scripts run arbitrary code on your machine during `pnpm install`. A compromised package could steal tokens or plant malware. pnpm blocks them by default and only lets listed packages (esbuild, swc) run theirs.

**Why do shared packages compile to `dist/` instead of being imported as `.ts`?**
The API and worker run on plain Node, which can't execute TypeScript from another package. Compiling once also gives every consumer the same JS and `.d.ts` types, and Turbo can cache the result.

**Prettier vs ESLint: which one flags a missing `await`?**
ESLint, through the type-aware rule `no-floating-promises`. Prettier only changes how code looks, never what it means.

**Why does `devDefault` deliberately not default in production?**
A silent default like `localhost:5432` would make a misconfigured production container start and then fail in confusing ways, or connect somewhere unintended. Without a default, it refuses to start and names the missing variable.

## My notes

<!-- Write your own notes here. -->
