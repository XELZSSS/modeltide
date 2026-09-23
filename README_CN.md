<div align="center">

# ModelTide

<strong>AI 模型数据看板</strong> —— 排行、发布、资讯、对比、状态监测

中文 · [English](./README.md)

<p>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-7-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://workers.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Workers" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

## 功能特性

| 特性       | 说明                 |
| ---------- | -------------------- |
| 模型排行   | 多维度排行与基准评测 |
| 发布追踪   | 最新与开源发布       |
| 资讯聚合   | 多类目行业资讯       |
| 模型对比   | 模型与价格对比       |
| 数据源状态 | 可用性与延迟监测     |

## 架构

- **前端**：Vite SPA，页面导航由静态资产层直接服务
- **API**：`/api/*` 在 Worker 中运行，结果缓存于 KV/内存
- **定时任务**：每 30 分钟——状态采样 + 缓存预热

## 项目结构

```text
modeltide/
├── src/client/     # SPA：视图、路由、组件、查询
├── src/server/     # 数据源、解析器、缓存
├── src/shared/     # 共享类型/配置/国际化
├── src/contract/   # 接口契约：路径 → 载荷
├── src/styles/     # 样式
├── worker/         # Worker 入口：API + cron
├── public/         # 静态资源 + Service Worker
├── scripts/        # 构建脚本
├── index.html      # SPA 入口
├── vite.config.ts  # Vite 配置
├── wrangler.jsonc  # 部署配置
└── package.json    # 依赖
```

## 快速开始

要求 Node.js ≥ 22.22.2

```bash
npm install
npm run dev      # http://localhost:5173
```

## 常用命令

| 命令             | 说明                 |
| ---------------- | -------------------- |
| `npm run dev`    | 开发服务器           |
| `npm run build`  | 生产构建             |
| `npm run test`   | 运行测试             |
| `npm run lint`   | 静态检查             |
| `npm run format` | 代码格式化           |
| `npm run deploy` | 构建并部署到 Workers |
| `npm run clean`  | 清理构建产物         |
| `npm run audit`  | 依赖安全扫描         |

## 部署

1. Fork 本仓库
2. (推荐)创建 KV 命名空间并替换 `wrangler.jsonc` 中的 ID——未配置时数据退回内存缓存，
   状态历史不持久化
3. (可选)`npx wrangler secret put STATUS_PING_URL`，填入
   [Healthchecks.io](https://healthchecks.io/docs/monitoring_cron_jobs/) 的 ping URL，cron 停止运行时会收到告警
4. `npx wrangler login` 登录一次，然后 `npm run deploy`

`CACHE_VERSION` 由数据层代码内容哈希自动生成，无需手动维护。

## 许可证

[MIT](./LICENSE)
