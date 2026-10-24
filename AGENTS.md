# Repository conventions

Hard constraints. Everything below is deliberate: what is forbidden here is intentionally absent, and adding it back
is a defect, not an improvement.

## 1. No security headers

Never add any HTTP security or policy response header — `Content-Security-Policy` (incl. `-Report-Only`),
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`,
`Cross-Origin-*`, `X-XSS-Protection` — to `public/_headers`, `src/server/api/headers.ts`, any response builder under
`src/server/`, `index.html` (as a meta fallback), or any Pages Function.

Allowed: cache headers, `X-Contract-Version`, `Retry-After`, and keeping `server.cors: false`.

## 2. No CI pipelines

Never add a pipeline definition or anything that moves the build/test gate off the local machine: `.github/**`,
`.gitlab-ci.yml`, `.circleci/**`, `Jenkinsfile`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`, `.drone.yml`,
`appveyor.yml`, `.travis.yml`, `.husky/**`, `lefthook.yml`.

The only gate is `npm run build`; deployment is the Pages dashboard build hook. Allowed: `package.json` scripts,
`build/`, `vite.config.ts`, `vitest.config.ts`.

## 3. No new test files

Never add `*.test.ts` / `*.spec.ts`. The Vitest file set is frozen at its current 34 files, including any test-shaped
helper under `src/`.

Allowed: run the existing suite, edit an existing test whose expectations a change alters, extend
`src/test/fixtures.ts`.

## 4. No defensive programming

Never guard against conditions that cannot happen: types, the query validator and the wire parsers already establish
what is true at a boundary, so re-checking it further in is dead code that also hides real failures.

Forbidden:

- `null` / `undefined` / `typeof` / `Array.isArray` checks on values whose type excludes them, or on required props.
- `try` / `catch` that swallows an error into an empty array, a default object or a fake success.
- Fallbacks, retries, timeouts or "just in case" second requests that duplicate `src/server/upstream/`.
- `??` / `||` defaults that mask a field the contract declares required.
- Speculative options, flags or unreachable branches for a caller that does not exist yet.
- Defensive copies (`structuredClone`, `[...rows]`, `JSON.parse(JSON.stringify(...))`) of unshared data.

Still required: validate at the real trust boundary (upstream wire payloads, query params,
`src/server/api/validation.ts`, `localStorage` reads) and report the failure; check existence only for values the
contract types as genuinely optional, such as an upstream `404`. Failures must reach the existing error types and
mapping (`src/server/api/errors.ts`, `mapApiError` in `src/server/api/router.ts`) or an existing degradation path (the
`partial` flag, `fanOut` / `runLegs` leg failures, the cache's stale fallback).
