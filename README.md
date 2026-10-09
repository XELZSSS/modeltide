<div align="center">

# ModelTide

**AI model data dashboard** — rankings, releases, news, comparison, status

[中文](./README_CN.md) · English

<p>
  <a href="https://vuejs.org"><img src="https://img.shields.io/badge/Vue-3-41B883?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://pages.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Pages" /></a>
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

- **Client**: Vite SPA — static output in `dist`, SPA fallback via `public/_redirects`
- **API**: `/api/*` runs as Pages Functions (`functions/api/[[route]].ts`), cached in KV / memory
- **Status**: on-demand self-heal on request

## Structure

```text
src/client/   SPA: views, router, components, queries
src/server/   Data sources, parsers, cache
src/shared/   Shared types, config, contract, i18n
functions/    Pages Functions entry: /api/* routes
public/       Static assets + PWA
scripts/      Build scripts
```

## Quick Start

Requires Node.js ≥ 20.19.0

```bash
npm install
npm run dev    # http://localhost:5173
```

## Commands

| Command          | Description        |
| ---------------- | ------------------ |
| `npm run dev`    | Dev server         |
| `npm run build`  | Production build   |
| `npm run test`   | Run tests          |
| `npm run lint`   | Lint               |
| `npm run format` | Format             |

## Deployment

Connect the repository to Cloudflare Pages with Framework `Vite`, Build command `npm run build` and Output directory `dist`, `functions/` deploys automatically, optionally bind a KV namespace named `CACHE` for persistent caching

## License

[MIT](./LICENSE)
