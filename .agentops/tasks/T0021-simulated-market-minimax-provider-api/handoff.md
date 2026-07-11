## What Changed

针对 review 再次要求的 bounded revision：

1. **严格校验 `SIMULATED_MARKET_LLM_TIMEOUT_MS`**：
   - `apps/server/src/services/simulated-market-provider.ts` 的 `parseTimeoutMs` 不再使用宽松的 `parseInt`：改为先 `trim()`，再用 `/^\d+$/` 严格校验“仅数字字符”，任何包含非数字（如 `123abc`、`abc123`、`-1`、`12.34`）或空字符串都回退为 `30000`。
   - 校验后仍检查正整数，确保 `0` 也回退为 `30000`。

2. **增加 invalid timeout 的 smoke 验证**：
   - `apps/server/scripts/smoke-simulated-market.mjs` 新增 Phase 4，启动 server 时传入 `SIMULATED_MARKET_LLM_TIMEOUT_MS=abc123`。
   - 验证 server 未因非法 timeout 崩溃，`GET /simulated-market/agent-templates` 和 `POST /simulated-market/runs` 均返回 200，且 fake LLM 成功路径正常。

其余保持 T0021 已有实现：Minimax provider 封装、modelVersion 随 `SIMULATED_MARKET_MODEL` 实际取值、timeout 正整数回退、fake LLM 入口、fallback 与 qualityFlags、临时 workspace smoke 隔离等。

## Files Changed

- `apps/server/src/services/simulated-market-provider.ts` （修改）
- `apps/server/scripts/smoke-simulated-market.mjs` （修改）
- `docs/api-contract.md` 已在上一版更新，未再改动

## Validation

- `cd apps/server && npm run typecheck`：通过。
- `cd apps/server && npm run schema:check`：通过。
- `cd apps/server && npm run smoke:simulated-market`：通过，44/44 assertions 通过（新增 Phase 4 invalid timeout 不崩溃）。
- `cd apps/model && npm run simulated-market-contract-test`：通过。
- `git diff --check`：无空白字符或 EOF 问题。

## Risks

- 真实 Minimax API 的实际响应格式（字段名、HTTP 状态码、鉴权 header）可能与本实现假设的 OpenAI-compatible `/v1/chat/completions` 不完全一致。当前实现已将任何 HTTP 非 2xx 或响应解析失败视为 fallback，不会导致接口崩溃；但如果 Minimax 实际成功码或字段结构不同，可能永远走 fallback。
- `SIMULATED_MARKET_FAKE_LLM=true` 时返回的是 `apps/model` 的 `buildFakeSimulatedMarketLlmResponse`，其输入质量 flag 为空。Smoke 只验证 fake LLM 成功路径，不覆盖 fake LLM 失败路径。
- 未对 `MINIMAX_API_KEY` 做格式校验，空字符串被视为未配置。

## Open Questions

- 是否需要新增 `smoke:simulated-market-live` 脚本并显式跳过无 key 场景？当前仅在 `docs/api-contract.md` 中给出手动命令示例。
- 是否需要在前端展示 `llm_unavailable_fallback_used` 的提示文案？当前后端已返回 flag，前端未处理。
- 是否需要在 audit meta 中记录 fallback 原因（仍不记录 API key 或原始错误）？当前 audit meta 只保留 `provider` / `modelVersion` / `qualityFlags`。

## Env / Restart Notes

新增环境变量（server 启动时读取，修改后需重启 server）：

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `MINIMAX_API_KEY` | — | 真实 Minimax API key；未配置则自动 fallback。 |
| `MINIMAX_API_HOST` | `https://api.minimaxi.com` | Minimax API host。 |
| `SIMULATED_MARKET_MODEL` | `minimax-m3` | 模型名；LLM 成功时返回的 `modelVersion` 等于该值。 |
| `SIMULATED_MARKET_LLM_TIMEOUT_MS` | `30000` | 调用超时毫秒；仅接受纯数字正整数（trim 后），非法值回退 30000。 |
| `SIMULATED_MARKET_FAKE_LLM` | `false` | 设置为 `true` 使用 fake LLM，不发起网络请求。 |

`MINIMAX_API_KEY` 仅在 server 端读取，不写入日志、DB、audit meta、前端响应或仓库。

## Contract Drift or Change Requests

- `docs/api-contract.md` 已更新为“默认 minimax-m3，fallback 兜底；`modelVersion` 随 `SIMULATED_MARKET_MODEL` 实际取值；timeout 仅接受纯数字正整数”。
- `POST /simulated-market/runs` 的 URL、Headers、Body、响应 wrapper 均未改变；`provider` / `modelVersion` / `qualityFlags` 的取值随运行模式和配置变化。
- 建议后续任务：如真实 Minimax endpoint 确认，需同步调整 `callSimulatedMarketLlm` 中的 path 和 response 解析。

## Memory Candidates

- 后端对接外部 LLM 时，应统一将“未配置 key / 超时 / 非法响应 / 模型校验失败”收敛为 fallback，避免把错误原文或 key 泄漏到响应/audit；可沉淀为 backend 错误处理规则。
- 默认 CI smoke 必须使用 fake provider 或 fallback，不因真实 key/网络缺失而失败；可沉淀为 backend smoke 设计规则。
- 可配置参数（如 model、timeout）必须在返回结果和 smoke 中验证其实际生效值，且解析必须严格（如纯数字正则），避免 `parseInt` 的隐式截断；可沉淀为 backend 配置一致性规则。

## Memory Used

- 已读取 `agentops/memory/mimo-backend.md`。受其「Read real routes, handlers, schemas, and storage code before changing backend behavior」与「Keep errors explicit. Do not swallow exceptions or convert unknown failures into success」规则影响：
  - 实现前读取了相关 route/adapter/provider/model 文件。
  - 非法 timeout 配置显式回退为默认值，不抛出或崩溃；不将 API key 或错误原文泄漏到响应/audit。
- 该 domain memory 中暂无需要刷新 lifecycle 的 Active Lessons。
