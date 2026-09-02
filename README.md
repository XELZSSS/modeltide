<div align="center">

# AITIWETA

<strong>AI model data dashboard</strong> — aggregating model rankings, benchmarks, pricing, and release tracking

<p>
  <a href="./README_CN.md"><img src="https://img.shields.io/badge/阅读-中文-1677ff?style=for-the-badge" alt="中文" /></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/Read-English-111827?style=for-the-badge" alt="English" /></a>
</p>

<p>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://hono.dev"><img src="https://img.shields.io/badge/Hono-4-E36002?style=flat-square&logo=hono&logoColor=white" alt="Hono" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🧭 Project Structure](#-project-structure)
- [🚀 Quick Start](#-quick-start)
- [💻 Commands](#-commands)
- [📦 Deployment](#-deployment)
- [📄 License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏆 **Model Rankings** | Intelligence index, hallucination rates, provider stats and per-model details |
| 📢 **Release Tracking** | Newest model & open-source releases with download stats |
| 📰 **News Aggregation** | Multi-source RSS for industry / open source / hardware / funding |
| ⚖️ **Model Comparison** | Radar-chart metrics, price breakdown and a monthly cost estimator |
| 🩺 **Source Status** | Live availability & latency monitoring of upstream sources |

---

## 🧭 Project Structure

```text
aitiweta/
├── src/            # Source
│   ├── client/     # Frontend
│   ├── server/     # Worker backend
│   ├── shared/     # Shared
│   └── styles/     # Styles
├── public/         # Static assets
├── wrangler.jsonc  # Deploy config
└── package.json    # Dependencies
```

---

## 🚀 Quick Start

**Prerequisites:** Node.js ≥ 22

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (default port 3000)
npm run dev
```

Open `http://localhost:3000` — the dev server runs the React client and the Worker API together, backed by a local in-memory KV, so no extra setup is needed

> Tip: for production, run `npm run build` then `npm run deploy` — see [Commands](#-commands)

---

## 💻 Commands

### Development

```bash
npm run dev        # Start the dev server (port 3000, Vite + Workers)
npm run build      # Production build (recomputes the CSP hash)
npm run preview    # Build + serve the production bundle locally
```

### Deploy

```bash
npm run deploy     # Build and deploy to Cloudflare Workers
```

### Quality

```bash
npm run test       # Unit & Worker integration tests (Vitest)
npm run lint       # Static analysis (oxlint)
npm run type-check # Type checking (tsc)
npm run format     # Code formatting (oxfmt)
```

### Maintenance

```bash
npm run audit      # Security scan of dependencies
```

---

## 📦 Deployment

A single Cloudflare Worker serves both static assets and the API — upstream data is cached in a KV namespace and refreshed by a scheduled cron

1. **Fork** this repository
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV**, create a namespace and copy its ID
3. **Configure** — paste the KV namespace ID into the `id` field in `wrangler.jsonc` and commit
4. **Deploy** — in **Workers & Pages** → **Create application** → **Import a repository**, select your fork and click **Save and Deploy**
5. **Stay updated** — every push to the repository automatically triggers a rebuild and redeploy

> **Note on the KV free plan** — the free tier caps KV at **1,000 writes/day**, and the cron scheduler (status-history sampling + cache warmup) consumes most of that. The deployment keeps working, but cache writes start failing near the cap, so data refreshes less often. The **Workers Paid** plan (1M writes/day) removes the limit.

> `worker-configuration.d.ts` at the repo root is **generated** by `npx wrangler types` (Cloudflare bindings types). Don't edit it by hand; regenerate it after changing `wrangler.jsonc`.

---

## 📄 License

[MIT](./LICENSE)