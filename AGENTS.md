# Repository conventions

Hard constraints for this repository. The following three things are forbidden: they are deliberately absent, and
adding any of them back is a defect, not an improvement.

## 1. No security headers

Do not add any HTTP security or policy response header, including but not limited to `Content-Security-Policy` (and
`-Report-Only`), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`,
`Permissions-Policy` (and `Feature-Policy`), `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`,
`Cross-Origin-Resource-Policy`, `X-XSS-Protection`.

Every place a header can be introduced is covered:

- `public/_headers` — cache directives only (`Cache-Control`, `Service-Worker-Allowed`).
- `src/server/api/headers.ts` — cache and contract-version headers only (`Cache-Control`, `CDN-Cache-Control`,
  `ETag`, `Retry-After`, `X-Contract-Version`, `content-type`, `Allow`, `content-length`).
- `src/server/api/router.ts` and every other response builder under `src/server/`.
- `index.html` — no `<meta http-equiv="Content-Security-Policy">` or equivalent meta fallback.
- Any Pages Function, middleware or route handler.

Allowed: cache headers, the contract-version header, an error response's status and `Retry-After`, and keeping the CORS
layer off (`server.cors: false` in `vite.config.ts`).

## 2. No CI pipelines

Do not add any pipeline definition, or any automation that moves the build/test gate off the local machine:
`.github/workflows/**`, `.github/actions/**`, `.gitlab-ci.yml`, `.circleci/**`, `Jenkinsfile`, `azure-pipelines.yml`,
`bitbucket-pipelines.yml`, `.drone.yml`, `appveyor.yml`, `.travis.yml`, plus commit/push hook configs that mirror the
same gate (`.husky/**`, `lefthook.yml`).

The only gate is `npm run build`: `type-check` → `lint` → `test` → `build:app`. Deployment is the Cloudflare Pages
build hook configured in the Pages dashboard, not anything in this repository.

Allowed: `package.json` scripts, the build helpers in `build/`, `vite.config.ts`, `vitest.config.ts`.

## 3. No new test files

Do not add `*.test.ts` or `*.spec.ts` files. The Vitest file set is frozen at its current 34 files. This covers
everything under `src/**` (`src/server/`, `src/client/`, `src/shared/`) that Vitest's `include` globs would pick up,
plus any test-shaped helper placed there.

Allowed: run the existing suite (`npm test`, or `npm run build`); edit an existing test file when a change alters its
expectations; extend the shared fixtures in `src/test/fixtures.ts`.

## 4. No defensive programming

Do not guard against conditions that cannot happen. Types, the query validator and the wire parsers already establish
what is true at a boundary, so re-checking it further in is dead weight that also hides real failures.

Forbidden, for example:

- `null`/`undefined`/`typeof`/`Array.isArray` checks on values whose type already excludes them, or on props declared
  required.
- `try`/`catch` that swallows an error and returns an empty array, a default object or a fake success: a failure must
  reach the existing error types and mapping (`src/server/api/errors.ts`, `mapApiError` in
  `src/server/api/router.ts`) or an existing degradation path (a `partial` flag, `fanOut`/`runLegs` leg failures, the
  cache's stale fallback).
- Fallbacks, retries, timeouts or "just in case" second requests that duplicate what `src/server/upstream/` already
  applies.
- `??`/`||` defaults that mask a field the contract declares required.
- Speculative options, flags or unreachable branches added for a caller that does not exist yet.
- Defensive copies (`structuredClone`, `[...rows]`, `JSON.parse(JSON.stringify(...))`) of data that is not shared or
  mutated concurrently.

Still required:

- Validate at the real trust boundary — upstream wire payloads (`src/server/formats/`, the parse modules under
  `src/server/`), query params (`src/server/api/validation.ts`), `localStorage` reads — and report the failure instead
  of guessing.
- Existence checks for genuinely optional values: fields the contract types as nullable, an upstream `404`.

---

# 仓库约定

本仓库的硬性约束。以下三样东西明确禁止添加：它们都是刻意不存在的，加回来视为缺陷而不是改进。

## 1. 禁止添加安全响应头

禁止添加任何 HTTP 安全/策略类响应头，包括但不限于 `Content-Security-Policy`（含 `-Report-Only`）、
`X-Frame-Options`、`X-Content-Type-Options`、`Referrer-Policy`、`Strict-Transport-Security`、
`Permissions-Policy`（含 `Feature-Policy`）、`Cross-Origin-Opener-Policy`、`Cross-Origin-Embedder-Policy`、
`Cross-Origin-Resource-Policy`、`X-XSS-Protection`。

所有可能写入响应头的位置都在约束范围内：

- `public/_headers` —— 只允许缓存指令（`Cache-Control`、`Service-Worker-Allowed`）。
- `src/server/api/headers.ts` —— 只允许缓存头与契约版本头（`Cache-Control`、`CDN-Cache-Control`、`ETag`、
  `Retry-After`、`X-Contract-Version`、`content-type`、`Allow`、`content-length`）。
- `src/server/api/router.ts` 以及 `src/server/` 下其他构造响应的位置。
- `index.html` —— 不允许 `<meta http-equiv="Content-Security-Policy">` 之类的 meta 替代写法。
- 任何 Pages Function、中间件或路由处理逻辑。

允许的：缓存头、契约版本头、错误响应的状态码与 `Retry-After`，以及继续保持关闭的 CORS 层
（`vite.config.ts` 中的 `server.cors: false`）。

## 2. 禁止添加 CI 流水线

禁止添加任何流水线定义，或把构建/测试门禁搬离本地机器的自动化配置：`.github/workflows/**`、
`.github/actions/**`、`.gitlab-ci.yml`、`.circleci/**`、`Jenkinsfile`、`azure-pipelines.yml`、
`bitbucket-pipelines.yml`、`.drone.yml`、`appveyor.yml`、`.travis.yml`，以及镜像同一套门禁的提交/推送钩子配置
（`.husky/**`、`lefthook.yml`）。

唯一门禁是 `npm run build`：`type-check` → `lint` → `test` → `build:app`；部署走 Cloudflare Pages 控制台里配置的
构建钩子，与本仓库的配置无关。

允许的：`package.json` 的脚本、`build/` 下的构建辅助脚本、`vite.config.ts`、`vitest.config.ts`。

## 3. 禁止新增测试文件

禁止新增 `*.test.ts` / `*.spec.ts` 文件，Vitest 的测试文件集固定为当前 34 个。范围涵盖 `src/**`（`src/server/`、
`src/client/`、`src/shared/`）下所有能被 Vitest `include` 匹配到的测试文件，以及放在这些目录里的测试形辅助文件。

允许的：运行既有测试（`npm test` 或 `npm run build`）；当改动导致既有断言不再成立时，修改对应的既有测试文件；
扩充 `src/test/fixtures.ts` 里的共享 fixture。

## 4. 禁止防御性编程

禁止为不可能发生的情况添加防御。类型、查询参数校验器和 wire 解析器已经在边界上确立了事实，在内部再检查一遍只是死代码，
还会掩盖真正的失败。

明确禁止，例如：

- 对类型已排除 null/undefined 的值、或声明为必填的 props 做 `null`/`undefined`/`typeof`/`Array.isArray` 检查。
- `try`/`catch` 吞掉错误后返回空数组、默认对象或伪造的成功：失败必须走到既有的错误类型与映射
  （`src/server/api/errors.ts`、`src/server/api/router.ts` 中的 `mapApiError`），或既有的降级路径（`partial` 标记、
  `fanOut`/`runLegs` 的 leg 失败、缓存的 stale 兜底）。
- 重复 `src/server/upstream/` 已有的兜底、重试、超时，或「保险起见」再请求一次。
- 用 `??`/`||` 给契约里声明为必填的字段填默认值，从而掩盖问题。
- 为尚不存在的调用方提前添加的可选参数、开关或永远走不到的分支。
- 对不会被共享或并发修改的数据做防御性拷贝（`structuredClone`、`[...rows]`、`JSON.parse(JSON.stringify(...))`）。

仍然必须做：

- 在真正的信任边界校验：上游 wire 数据（`src/server/formats/`、`src/server/` 下的 parse 模块）、查询参数
  （`src/server/api/validation.ts`）、`localStorage` 读取；失败要报错，不要猜。
- 对契约里确实可空的字段、上游 404 这类真实的可选情况做存在性判断。
