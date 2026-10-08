<div align="center">

# ModelTide

**AI model data dashboard** — rankings, releases, news, comparison, status

[中文](./README_CN.md) · English

<p>
  <a href="https://vuejs.org"><img src="https://img.shields.io/badge/Vue-3-41B883?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

## Features

| Module           | Description                               |
| ---------------- | ----------------------------------------- |
| Model Rankings   | Multi-dimensional rankings and benchmarks |
| Release Tracking | Latest and open-source releases           |
| News Aggregation | Industry news across categories           |
| Model Comparison | Side-by-side model and price comparison   |
| Source Status    | Availability and latency monitoring       |

## Architecture

- **Client**: Vite SPA — page navigations served as static assets
- **API**: `/api/*` runs in the Worker, cached in KV / memory
- **Cron**: hourly — status sampling + cache warmup

## Structure

```text
src/client/   SPA: views, router, components, queries
src/server/   Data sources, parsers, cache
src/shared/   Shared types, config, contract, i18n
worker/       Worker entry: API routes + cron
public/       Static assets + service worker
scripts/      Build scripts
```

## Quick Start

Requires Node.js ≥ 22.22.2

```bash
npm install
npm run dev    # http://localhost:5173
```

## Commands

| Command          | Description                 |
| ---------------- | --------------------------- |
| `npm run dev`    | Dev server                  |
| `npm run build`  | Production build            |
| `npm run test`   | Run tests                   |
| `npm run lint`   | Lint                        |
| `npm run format` | Format                      |
| `npm run deploy` | Build and deploy to Workers |

## Deployment

1. Fork the repository
2. _(Recommended)_ Create a KV namespace and replace the ID in `wrangler.jsonc` — without KV, data falls back to in-memory cache and status history is not persisted
3. _(Optional)_ `npx wrangler secret put STATUS_PING_URL` with a [Healthchecks.io](https://healthchecks.io/docs/monitoring_cron_jobs/) ping URL for cron-failure alerts
4. `npx wrangler login` once, then `npm run deploy`

`CACHE_VERSION` is content-hashed from the data-shaping code — no manual bump needed.

## License

[MIT](./LICENSE)
