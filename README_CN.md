<div align="center">

<img src="./public/icons/app-icon.svg" width="120" alt="ModelTide" />

# ModelTide

<strong>AI 模型数据看板</strong> —— 聚合模型排名、评测基准、价格与发布动态

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

## 📑 目录

- [✨ 功能特性](#-功能特性)
- [🧭 项目结构](#-项目结构)
- [🚀 快速开始](#-快速开始)
- [💻 常用命令](#-常用命令)
- [📦 部署](#-部署)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

| 特性              | 说明                                   |
| ----------------- | -------------------------------------- |
| 🏆 **模型排行**   | 智能指数、幻觉率、提供商统计与模型详情 |
| 📢 **发布追踪**   | 最新模型与开源发布，附下载统计         |
| 📰 **资讯聚合**   | 行业 / 开源 / 硬件 / 投融资多源 RSS    |
| ⚖️ **模型对比**   | 雷达图指标对比、价格明细与月成本估算   |
| 🩺 **数据源状态** | 上游可用性与延迟实时监测               |

---

## 🧭 项目结构

```text
modeltide/
├── src/            # 源码
│   ├── client/     # 前端
│   ├── server/     # Worker 后端
│   ├── shared/     # 共享
│   └── styles/     # 样式
├── public/         # 静态资源
├── wrangler.jsonc  # 部署配置
└── package.json    # 依赖
```

---

## 🚀 快速开始

**环境要求：** Node.js ≥ 22

```bash
npm install
npm run dev      # 前端 + Worker API：http://localhost:3000
```

无需额外配置（KV 行为差异见 [部署](#-部署)）。需对齐 Worker 时用 `wrangler dev`（8787 端口）。

---

## 💻 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器（3000 端口，Vite + Workers） |
| `npm run build` | 生产构建（同步更新 CSP 哈希；dist 自动清空） |
| `npm run preview` | 本地预览生产产物（仅静态预览，非 Worker） |
| `npm run deploy` | 构建并部署到 Cloudflare Workers |
| `npm run test` | 单元与 Worker 集成测试（Vitest） |
| `npm run lint` | 静态检查（oxlint） |
| `npm run type-check` | 类型检查（tsc） |
| `npm run format` | 代码格式化（oxfmt） |
| `npm run audit` | 依赖安全扫描 |

---

## 📦 部署

单个 Cloudflare Worker 同时托管静态资源与 API，上游数据经缓存并由定时 Cron 刷新。

1. **Fork** 本仓库。
2. **（可选）KV 缓存** —— 在 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV** 创建命名空间，将 ID 填入 `wrangler.jsonc` 的 `kv_namespaces`（取消注释）后提交。
3. **部署** —— **Workers & Pages** → **Create application** → **Import a repository**，选择 Fork 的仓库并 **Save and Deploy**。
4. **自动更新** —— 每次推送都会自动重新构建并部署。

| | 未配置 KV（默认） | 配置 KV |
| --- | --- | --- |
| 数据 | 每次请求直连上游 | 三档缓存（30 分钟/2 小时/6 小时） |
| 状态历史 | 仅内存保留（重启后丢失） | 持久化 90 天历史 |
| 限流 | 不生效 | 生效 |

> 注意：KV 免费版限制 **1,000 次写入/天**，主要被定时任务（采样 + 预热）消耗。接近上限后缓存写入失败、刷新变慢，**Workers Paid**（100 万次写入/天）不受此限制。

> 仓库根目录的 `worker-configuration.d.ts` 由 `npx wrangler types` 生成，请勿手工编辑；修改 `wrangler.jsonc` 后重新生成即可。

---

## 📄 许可证

[MIT](./LICENSE)
