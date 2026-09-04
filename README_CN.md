<div align="center">

<img src="./public/icons/app-icon.svg" width="120" alt="ModelTide" />

# ModelTide

<strong>AI 模型数据看板</strong> —— 排名、评测、价格、发布动态

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

## 功能特性

| 特性       | 说明                                  |
| ---------- | ------------------------------------- |
| 模型排行   | 智能指数、幻觉率、提供商统计与详情    |
| 发布追踪   | 最新与开源发布，附下载统计            |
| 资讯聚合   | 多源 RSS：行业 / 开源 / 硬件 / 投融资 |
| 模型对比   | 雷达图指标、价格明细与月成本估算      |
| 数据源状态 | 上游可用性与延迟监测                  |

## 项目结构

```text
modeltide/
├── src/client/     # 前端
├── src/server/     # Worker 后端
├── src/shared/     # 共享类型/配置/国际化
├── src/styles/     # 样式
├── public/         # 静态资源
├── wrangler.jsonc  # 部署配置
└── package.json    # 依赖
```

## 快速开始

要求 Node.js ≥ 22。

```bash
npm install
npm run dev      # 前端 + Worker API：http://localhost:3000
```

需对齐 Worker 时用 `wrangler dev`（8787 端口）。

## 常用命令

| 命令                 | 说明                    |
| -------------------- | ----------------------- |
| `npm run dev`        | 开发服务器（3000 端口） |
| `npm run build`      | 生产构建                |
| `npm run preview`    | 本地预览生产产物        |
| `npm run deploy`     | 构建并部署到 Workers    |
| `npm run test`       | 测试（Vitest）          |
| `npm run lint`       | 静态检查（oxlint）      |
| `npm run type-check` | 类型检查（tsc）         |
| `npm run format`     | 代码格式化（oxfmt）     |
| `npm run audit`      | 依赖安全扫描            |

## 部署

单个 Worker 同时托管静态资源与 API，定时 Cron 每 30 分钟刷新缓存。

1. Fork 本仓库。
2. （推荐）KV：Dashboard → Workers & Pages → KV → 新建命名空间，将 ID 填入 `wrangler.jsonc` 的 `kv_namespaces`。
3. （可选）`npx wrangler secret put HF_TOKEN`，填入只读 [HF 令牌](https://huggingface.co/settings/tokens)以提高 API 限额。
4. Workers & Pages → Create application → Import a repository → Save and Deploy。

|          | 未配置 KV（默认） | 配置 KV（免费版足够）             |
| -------- | ----------------- | --------------------------------- |
| 数据     | 每次请求直连上游  | 三档缓存（30 分钟/2 小时/6 小时） |
| 状态历史 | 仅内存保留        | 持久化 90 天历史                  |
| 限流     | 不生效            | 生效                              |

KV 免费版每天 1,000 次写入（稳态仅消耗几百次）。冷缓存未命中可能因 10 毫秒 CPU 上限短暂返回 `1102`；命中缓存后成本极低。

`worker-configuration.d.ts` 由 `npx wrangler types` 生成，请勿手工编辑。

## 许可证

[MIT](./LICENSE)
