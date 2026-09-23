<div align="center">

# ModelTide

<strong>AI model data dashboard</strong> — rankings, releases, news, comparison, status

[中文](./README_CN.md) · English

<p>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

## Features

| Feature          | Description                               |
| ---------------- | ----------------------------------------- |
| Model Rankings   | Multi-dimensional rankings and benchmarks |
| Release Tracking | Latest and open-source releases           |
| News Aggregation | Industry news across categories           |
| Model Comparison | Side-by-side model and price comparison   |
| Source Status    | Availability and latency monitoring       |

## Architecture

- **Client**: Vite SPA — page navigations are served as static assets
- **API**: `/api/*` runs in the Worker, cached in KV/memory
- **Cron**: every 30 min — status sampling + cache warmup

## Structure

```text
modeltide/
├── src/client/     # SPA: views, router, components, queries
├── src/server/     # Data sources, parsers, cache
├── src/shared/     # Shared types/config/i18n
├── src/contract/   # API path → payload contract
├── src/styles/     # Styles
├── worker/         # Worker entrypoint: API + cron
├── public/         # Static assets + service worker
├── scripts/        # Build scripts
├── index.html      # SPA entry
├── vite.config.ts  # Vite config
├── wrangler.jsonc  # Deploy config
└── package.json    # Dependencies
```

## Quick Start

Requires Node.js ≥ 22.22.2

```bash
npm install
npm run dev      # http://localhost:5173
```

## Commands

| Command          | Description                 |
| ---------------- | --------------------------- |
| `npm run dev`    | Dev server                  |
| `npm run build`  | Production build            |
| `npm run test`   | Run tests                   |
| `npm run lint`   | Static analysis             |
| `npm run format` | Code formatting             |
| `npm run deploy` | Build and deploy to Workers |
| `npm run clean`  | Remove build artifacts      |
| `npm run audit`  | Dependency security scan    |

## Deployment

1. Fork the repository
2. (Recommended) Create a KV namespace and replace the ID in `wrangler.jsonc` — without KV, data
   falls back to an in-memory cache and status history is not persisted
3. (Optional) `npx wrangler secret put STATUS_PING_URL` with a
   [Healthchecks.io](https://healthchecks.io/docs/monitoring_cron_jobs/) ping URL for cron-failure alerts
4. `npx wrangler login` once, then `npm run deploy`

`CACHE_VERSION` is content-hashed from the data-shaping code, so it never needs a manual bump.

## License

[MIT](./LICENSE)
