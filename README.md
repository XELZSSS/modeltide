<div align="center">

# ModelTide

**轻量化 AI 聚合模型数据看板** — 支持 Cloudflare 部署

中文 · [English](./README_EN.md)

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

| 模块     | 说明                 |
| -------- | -------------------- |
| 模型排行 | 多维度排行与基准评测 |
| 发布追踪 | 最新与开源发布       |
| 资讯聚合 | 分类行业资讯         |
| 模型对比 | 模型与价格对比       |

## 架构

- **前端**：Vite SPA，静态产物在 `dist`，由 `public/_redirects` 做 SPA 回退
- **API**：`/api/*` 运行为 Pages Functions（`functions/api/`），结果缓存于 KV / 内存

### 数据来源

**排行榜单** —— `/models` 下的八个标签页，数据来自以下四家上游

| 来源                | 提供的数据                                                 |
| ------------------- | ---------------------------------------------------------- |
| Artificial Analysis | 智能指数、输出速度、价格、定位准确率、决策指数、编程智能体 |
| OpenRouter          | 用量排行（token 用量）、模型目录与价格                     |
| Hugging Face        | 开源模型排行（下载量、点赞、许可证、任务）                 |
| Cursor              | CursorBench 编码基准通过率                                 |

**资讯** —— `/news` 共十二个 RSS / Atom 源，每个分类三个：单个站点不可达不会清空该分类

| 分类 | 来源                                                |
| ---- | --------------------------------------------------- |
| 行业 | TechCrunch、Ars Technica、Google AI                 |
| 开源 | Simon Willison、Hugging Face、InfoQ                 |
| 硬件 | The Next Platform、ServeTheHome、NVIDIA             |
| 研究 | Google Research、Google DeepMind、Apple ML Research |

发布（`/releases`）取自 Artificial Analysis 排行榜页内嵌的发布数据，与榜单共用同一次抓取与同一份缓存

## 目录

```text
src/client/   前端 SPA
src/server/   后端 API
src/shared/   共享代码
functions/    Pages Functions 入口
build/        构建脚本
```

## 快速开始

要求 Node.js 22.18 或更高版本

```bash
npm install
npm run dev    # http://localhost:5173
```

## 命令

| 命令              | 说明                         |
| ----------------- | ---------------------------- |
| `npm run dev`     | 开发服务器                   |
| `npm run build`   | 类型、lint、格式、测试、构建 |
| `npm run check`   | 类型、lint、格式与一致性规则 |
| `npm run preview` | 预览已构建的 `dist`          |
| `npm run test`    | 测试（`test:watch` 可监听）  |
| `npm run lint`    | 静态检查                     |
| `npm run format`  | 代码格式化                   |

## 部署

连接到 Cloudflare Pages：Framework 选 `Vue`，构建命令 `npm run build`，输出目录 `dist`；可选绑定名为 `CACHE` 的 KV 命名空间（区分大小写）以实现持久化缓存

构建命令保持 `npm run build`：`functions/api/[[route]].js` 由它生成，改成裸 `vite build` 会让所有 `/api/*` 请求 404

## 许可证

[MIT](./LICENSE)
