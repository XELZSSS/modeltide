<div align="center">

# ModelTide

<strong>AI model data dashboard</strong> — rankings, releases, news, comparison, status

<p>
  <a href="./README_CN.md"><img src="https://img.shields.io/badge/阅读-中文-1677ff?style=for-the-badge" alt="中文" /></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/Read-English-111827?style=for-the-badge" alt="English" /></a>
</p>

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

| Feature          | Description                                |
| ---------------- | ------------------------------------------ |
| Model Rankings   | Multi-dimensional rankings and benchmarks  |
| Release Tracking | Latest and open-source releases            |
| News Aggregation | Industry news across categories            |
| Model Comparison | Side-by-side model and price comparison    |
| Source Status    | Availability and latency monitoring        |

## Architecture

Single Cloudflare Worker serves everything:

- **Client**: Vite 8 SPA — page navigations are served as static assets
- **API**: `/api/*` runs in the Worker, cached in KV/memory
- **Cron**: every 30 min — status sampling + cache warmup

## Structure

```text
modeltide/
├── src/client/     # SPA: views, router, components, queries
├── src/server/     # Data sources, parsers, cache
├── src/shared/     # Shared types/config/i18n
├── src/styles/     # Styles
├── worker/         # Worker entrypoint: API + cron
├── public/         # Static assets + service worker
├── scripts/        # Build checks
├── index.html      # SPA entry
├── vite.config.ts
├── wrangler.jsonc  # Deploy config
└── package.json    # Dependencies
```

## Quick Start

Requires Node.js ≥ 22.22

```bash
npm install
npm run dev      # http://localhost:5173
```

## Commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Dev server                           |
| `npm run build`      | Production build                     |
| `npm run preview`    | Preview the production build locally |
| `npm run deploy`     | Build + deploy to Workers            |
| `npm run check`      | Run all checks                       |
| `npm run test`       | Run tests                            |
| `npm run test:watch` | Tests in watch mode                  |
| `npm run lint`       | Static analysis                      |
| `npm run type-check` | Type checking                        |
| `npm run format`     | Code formatting                      |
| `npm run clean`      | Remove build artifacts               |
| `npm run audit`      | Dependency security scan             |

`deploy` runs `check` first; CI uses `npm run ci`

## Deployment

1. Fork the repository
2. (Recommended) Create a KV namespace and replace the ID in `wrangler.jsonc`
3. (Optional) `npx wrangler secret put HF_TOKEN` with a read-only [HF token](https://huggingface.co/settings/tokens) for Hugging Face routes
4. (Optional) `npx wrangler secret put STATUS_PING_URL` with a [Healthchecks.io](https://healthchecks.io/docs/monitoring_cron_jobs/) ping URL for cron-failure alerts
5. `npx wrangler login` once, then `npm run deploy` (or connect the repo via Workers Builds)

|                | Without KV   | With KV              |
| -------------- | ------------ | -------------------- |
| Data           | Memory cache | KV cache (30m/2h/6h) |
| Status history | Memory only  | 30-day history       |

`CACHE_VERSION` is auto-generated from a content hash of the data-shaping code (`scripts/gen-cache-version.cjs`) — nothing to bump manually; stale KV entries expire on their own

## License

[MIT](./LICENSE)
