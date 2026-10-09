<div align="center">

# ModelTide

**AI 模型数据看板** — 排行、发布、资讯、对比、状态

中文 · [English](./README.md)

<p>
  <a href="https://vuejs.org"><img src="https://img.shields.io/badge/Vue-3-41B883?style=flat-square&logo=vuedotjs&logoColor=white" alt="Vue" /></a>
  <a href="https://vite.dev"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" /></a>
  <a href="https://pages.cloudflare.com"><img src="https://img.shields.io/badge/Cloudflare-Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white" alt="Cloudflare Pages" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

</div>

## 功能

| 模块       | 说明                 |
| ---------- | -------------------- |
| 模型排行   | 多维度排行与基准评测 |
| 发布追踪   | 最新与开源发布       |
| 资讯聚合   | 分类行业资讯         |
| 模型对比   | 模型与价格对比       |
| 数据源状态 | 可用性与延迟监测     |

## 架构

- **前端**：Vite SPA，静态产物在 `dist`，由 `public/_redirects` 做 SPA 回退
- **API**：`/api/*` 运行为 Pages Functions（`functions/api/[[route]].ts`），结果缓存于 KV / 内存
- **状态**：请求时按需自愈

## 目录

```text
src/client/   SPA：视图、路由、组件、查询
src/server/   数据源、解析器、缓存
src/shared/   共享类型、配置、契约、i18n
functions/    Pages Functions 入口：/api/* 路由
public/       静态资源 + PWA
scripts/      构建脚本
```

## 快速开始

要求 Node.js ≥ 20.19.0

```bash
npm install
npm run dev    # http://localhost:5173
```

## 命令

| 命令             | 说明       |
| ---------------- | ---------- |
| `npm run dev`    | 开发服务器 |
| `npm run build`  | 生产构建   |
| `npm run test`   | 运行测试   |
| `npm run lint`   | 静态检查   |
| `npm run format` | 代码格式化 |

## 部署

连接仓库到 Cloudflare Pages：Framework 选 `Vite`，构建命令 `npm run build`，输出目录 `dist`，`functions/` 自动部署，可选绑定名为 `CACHE` 的 KV 实现持久化缓存

## 许可证

[MIT](./LICENSE)
