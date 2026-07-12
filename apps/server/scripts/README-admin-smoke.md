# Admin Database Smoke Tests

本目录包含 Admin Database API 的 smoke 测试脚本。所有脚本均通过 `PLS_API_BASE` / `PLS_API_TOKEN` / `PLS_ADMIN_TOKEN` / `PLS_WORKSPACE` 环境变量控制目标服务。

wrapper 脚本（`smoke:admin-empty`、`smoke:admin-imported`、`smoke:admin-summary`）使用**独立临时 workspace**，不依赖 `ws_demo` 的当前状态。独立脚本（`smoke:admin-database`、`smoke:admin-import`、`smoke:admin-dangerous`）默认仍以 `ws_demo` 为操作目标，但**会写 DB 的脚本在 `ws_demo` 上会被 guard 拒绝**，除非显式设置 controller-only override `PLS_ALLOW_WS_DEMO_WRITE=1`。独立脚本中，危险操作的正式 destructive 执行仍只发生在临时 workspace。

## 安全红线（ws_demo 写保护）

- `ws_demo` 是 fixture/demo workspace，受版本控制，禁止被 smoke / import / admin 脚本误写。
- 会写 DB 的脚本（`import-douyin-bi.mjs`、`seed-data-sources.mjs`、`sync-channel-entities.mjs`、`smoke-admin-import.mjs` imported 模式、`smoke-admin-dangerous.mjs`、`smoke-p2-api.mjs` 等）在目标 workspace 为 `ws_demo` 时默认失败。
- 如需显式覆盖，必须设置环境变量 `PLS_ALLOW_WS_DEMO_WRITE=1`（仅供 controller 使用），并在日志中输出警告。
- 推荐做法：让 wrapper 脚本创建临时 workspace，或手动设置 `PLS_WORKSPACE=ws_<purpose>_<timestamp>`。

## 前置条件

1. 后端服务已启动：`npm run start` 或 `npm run dev`（默认 `http://localhost:3100`）。
2. Admin token 可用：默认 `pls-admin-token`。
3. `PLS_WORKSPACE` 指向一个**受控测试 workspace**；默认 `ws_demo`。

## Smoke 分类与前置假设

### 1. `smoke:admin-empty` — 空业务库 smoke

运行：

```bash
cd apps/server
npm run smoke:admin-empty
```

假设：

- 脚本会**自动生成**临时 workspace `ws_empty_${timestamp}`。
- 通过 `rebuild` 在临时 workspace 中初始化完整 schema，**不导入任何业务数据**。
- 所有验证（database 只读、import dry-run、dangerous dry-run + 真实执行）均发生在临时 workspace，**不读取或修改 `ws_demo` 数据**。
- 运行结束后临时 workspace 文件保留，可手动清理 `data/workspaces/ws_empty_*`。

覆盖：

- `smoke-admin-database.mjs` (`PLS_ADMIN_SMOKE_MODE=empty`)
- `smoke-admin-import.mjs` (`PLS_ADMIN_SMOKE_MODE=dry-run`)
- `smoke-admin-dangerous.mjs` (dry-run + temp workspace 执行)

### 2. `smoke:admin-imported` — 重放数据后 smoke

运行：

```bash
cd apps/server
npm run smoke:admin-imported
```

假设：

- 脚本会**自动生成**临时 workspace `ws_imported_${timestamp}`（可通过 `PLS_WORKSPACE` 覆盖为指定 workspace）。
- 在目标 workspace 上通过 Admin API 依次导入 `data/demo` 和 `data/p1/douyin-bi`。
- 所有写操作（import、dangerous）均发生在目标 workspace 或临时 workspace，**不污染 `ws_demo`**。
- 运行结束后临时 workspace 文件保留，可手动清理 `data/workspaces/ws_imported_*`。

覆盖：

- `smoke-admin-import.mjs` (`PLS_ADMIN_SMOKE_MODE=imported`)
- `smoke-admin-database.mjs` (`PLS_ADMIN_SMOKE_MODE=imported`)
- `smoke-admin-dangerous.mjs` (dry-run + temp workspace 执行)

### 3. `smoke:admin-summary` — 汇总 JSON

运行：

```bash
cd apps/server
npm run smoke:admin-summary
```

假设：

- 自动创建隔离 workspace `ws_summary_empty_${timestamp}` 和 `ws_summary_imported_${timestamp}`。
- 对空库 workspace 先 rebuild 初始化，再运行 `smoke:admin-empty`。
- 对导入 workspace 运行 `smoke:admin-imported`（内部会 rebuild 并导入 demo + douyin-bi）。
- 汇总输出单条 JSON summary，便于 X 总控复核；**不污染 `ws_demo`**。

输出示例：

```json
{
  "timestamp": "2026-07-04T...",
  "allOk": true,
  "suites": {
    "empty": { "ok": true, "name": "admin-empty", "summary": { ... } },
    "imported": { "ok": true, "name": "admin-imported", "summary": { ... } }
  }
}
```

### 4. 原始独立脚本（保持兼容）

| script | 默认行为 | 环境变量 |
|---|---|---|
| `smoke:admin-database` | 空库模式验证 | `PLS_ADMIN_SMOKE_MODE=empty\|imported` |
| `smoke:admin-import` | dry-run 模式 | `PLS_ADMIN_SMOKE_MODE=dry-run\|imported` |
| `smoke:admin-dangerous` | 危险操作 dry-run + 临时 workspace 执行 | 无 |

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PLS_API_BASE` | `http://localhost:3100/api/v0` | API 基础地址 |
| `PLS_API_TOKEN` | `pls-p0-demo-token` | 普通 API token |
| `PLS_ADMIN_TOKEN` | `pls-admin-token` | Admin token |
| `PLS_WORKSPACE` | `ws_demo` | 目标 workspace |
| `PLS_ADMIN_SMOKE_MODE` | `empty` / `dry-run` | 仅用于独立脚本，wrapper 已自动设置 |
| `PLS_ALLOW_WS_DEMO_WRITE` | 未设置 | Controller-only override；设置 `1` 后才允许写 `ws_demo` |

## 红线

- 不为了让测试通过自动重放 user_authorized 数据到 `ws_demo`。
- 不在 smoke 中执行未拦截的 `ws_demo` rebuild、drop 或 delete version。
- 危险操作失败时必须输出 HTTP status 和 response body。
