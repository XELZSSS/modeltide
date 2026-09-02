<div align="center">

# AITIWETA

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
aitiweta/
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
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认端口 3000）
npm run dev
```

打开 `http://localhost:3000` —— 开发服务器会同时运行 React 前端与 Worker API，无需额外配置即可启动（未配置 KV 时 API 直连上游，状态历史仅保留在内存中）

单一入口：使用 `npm run dev`（Vite 独占 3000 端口）。需要与 Worker 行为完全对齐时，可用 `wrangler dev`（8787 端口）并行验证。

> 提示：生产环境依次执行 `npm run build`、`npm run deploy` 即可，详见 [常用命令](#-常用命令)

---

## 💻 常用命令

### 开发

```bash
npm run dev        # 启动开发服务器（端口 3000，Vite + Workers）
npm run build      # 生产构建（同步更新 CSP 哈希；Vite 会清空 dist，无需手动 rimraf）
npm run preview    # 构建并本地预览生产产物（纯 Vite 静态预览，不是 Worker —— 对齐 Worker 请用 8787 端口的 `wrangler dev`）
```

### 部署

```bash
npm run deploy     # 构建并部署到 Cloudflare Workers
```

### 质量

```bash
npm run test       # 单元与 Worker 集成测试（Vitest）
npm run lint       # 静态检查（oxlint）
npm run type-check # 类型检查（tsc）
npm run format     # 代码格式化（oxfmt）
```

### 维护

```bash
npm run audit      # 依赖安全扫描
```

---

## 📦 部署

单个 Cloudflare Worker 同时托管静态资源与 API；上游数据会被缓存，并由定时 Cron 刷新

1. **Fork** 本仓库
2. **（可选）KV 缓存** —— 在 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **KV** 创建一个命名空间，复制其 ID；取消 `wrangler.jsonc` 中 `kv_namespaces` 的注释并填入 `id` 后提交
3. **部署** —— 在 **Workers & Pages** → **Create application** → **Import a repository** 中选择 Fork 的仓库，点击 **Save and Deploy**
4. **自动更新** —— 每次推送到仓库都会自动重新构建并部署

> **未配置 KV**（默认）时部署仍可正常工作：每次请求直连上游，状态历史仅保留在内存中（实例重启后丢失），且按 IP 限流不生效。**配置 KV** 后可获得 30 分钟缓存、持久化的 90 天状态历史与限流保护。
>
> **关于 KV 免费套餐** —— 免费版 KV 限制 **1,000 次写入/天**，而定时任务（状态历史采样 + 缓存预热）会消耗其中大部分。部署仍可正常工作，但接近上限后缓存写入会开始失败，数据刷新频率随之下降。**Workers Paid** 套餐（100 万次写入/天）不受此限制。

> 仓库根目录的 `worker-configuration.d.ts` 是由 `npx wrangler types` **生成**的 Cloudflare 绑定类型声明，请勿手工编辑；修改 `wrangler.jsonc` 后重新生成即可。

---

## 📄 许可证

[MIT](./LICENSE)
