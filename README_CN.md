<div align="center">

# ModelTide

**AI 模型数据看板** — 排行、发布、资讯、对比、状态

中文 · [English](./README.md)

<p>
  <a href="https://vuejs.org"><img src="https://img.shields.io/badge/Vue-3-41B883?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

## 功能

| 模块 | 说明 |
| ---- | ---- |
| 模型排行 | 多维度排行与基准评测 |
| 发布追踪 | 最新与开源发布 |
| 资讯聚合 | 分类行业资讯 |
| 模型对比 | 模型与价格对比 |
| 数据源状态 | 可用性与延迟监测 |

## 架构

- **前端**：Vite SPA，页面导航由静态资产层服务
- **API**：`/api/*` 运行在 Worker，结果缓存于 KV / 内存
- **Cron**：每小时采样状态 + 缓存预热

## 目录

```text
src/client/   SPA：视图、路由、组件、查询
src/server/   数据源、解析器、缓存
src/shared/   共享类型、配置、契约、i18n
worker/       Worker 入口：API 路由 + cron
public/       静态资源 + Service Worker
scripts/      构建脚本
```

## 快速开始

要求 Node.js ≥ 22.22.2

```bash
npm install
npm run dev    # http://localhost:5173
```

## 命令

| 命令 | 说明 |
| ---- | ---- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run test` | 运行测试 |
| `npm run lint` | 静态检查 |
| `npm run format` | 代码格式化 |
| `npm run deploy` | 构建并部署到 Workers |

## 部署

1. Fork 本仓库
2.（推荐）创建 KV 命名空间并替换 `wrangler.jsonc` 中的 ID——未配置时回退到内存缓存，状态历史不持久化
3.（可选）`npx wrangler secret put STATUS_PING_URL` 设置 [Healthchecks.io](https://healthchecks.io/docs/monitoring_cron_jobs/)  ping URL，cron 异常时收到告警
4. `npx wrangler login` 后执行 `npm run deploy`

`CACHE_VERSION` 由数据层代码内容哈希自动生成，无需手动维护。

## 许可证

[MIT](./LICENSE)
