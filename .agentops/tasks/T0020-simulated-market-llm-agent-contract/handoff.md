## What Changed

在 `apps/model/src/simulated-market.ts` 中新增 LLM agent 模拟 contract，将模拟市场模型层从 deterministic fallback 主实现升级为 LLM 优先 + fallback 兜底：

- 新增 `buildSimulatedMarketPrompt(input)`：构建 system / user prompt，强制要求 LLM 逐一扮演输入中的全部 `TargetUserAgent` 并输出分 agent JSON 反馈，明确提醒结果是 Derived Result。
- 新增 `parseSimulatedMarketLlmResponse(raw, expectedAgentIds)`：严格解析 JSON（支持裸 JSON 与 markdown code fence），对 `overall` / `agentFeedback` 做字段与类型校验；对非法分数、数组缺失、agentId 不匹配/缺失/重复/未知等情况显式抛错，供 backend fallback。
- 新增 `runLlmSimulatedMarket(input, llmResponse, options)`：装配成 `SimulationRun`，仅当 LLM 响应成功解析时才使用 `provider="minimax"` / `modelVersion="minimax-m3"`；模型层 fallback 不会冒充 LLM。
- 新增 `buildFakeSimulatedMarketLlmResponse(input)`：fake response fixture，供默认 contract test 使用。
- 抽取 `collectInputQualityFlags(input)` 与 `buildMarketContextText(input)` 复用给 deterministic fallback 与 LLM 路径，保持输入质量标记一致。
- `DEFAULT_QUALITY_FLAGS` 新增 `llm_unavailable_fallback_used`，供 backend 在 LLM provider 不可用时标记 fallback 原因。
- 将 `MIN_STRATEGY_TEXT_LENGTH` 导出，供测试/调用方复用。
- 在 `docs/prd-simulated-market.md` 增加「二期口径」小节，明确 LLM 优先路径、模型层与 backend 的分工、fallback 冒充禁令、Derived Result 属性。

## Files Changed

- `apps/model/src/simulated-market.ts`
- `apps/model/src/simulated-market-contract-test.ts`
- `docs/prd-simulated-market.md`

## Validation

- `cd apps/model && npm run typecheck`：通过。
- `cd apps/model && npm run simulated-market-contract-test`：通过（全部用例通过）。
- `git diff --check`：无空白字符或行尾空行问题。

新增测试覆盖：
- LLM prompt 包含全部 target agents 与策略文本。
- fake LLM response 成功解析，provider/modelVersion 正确，不含 deterministic fallback flag。
- markdown code fence 包裹的 JSON 可正常解析。
- 非法 JSON、缺失 agentFeedback、未知 agent、缺失 agent、重复 agent 均显式失败。
- overall/agent 分数越界、confidence 越界、空 agentFeedback 数组均显式失败（拒绝策略，不 clamp）。
- 原有 deterministic fallback 测试全部保留。

## Risks

- 本次模型层只处理已提供的 LLM 响应字符串，不调用真实 Minimax 网络。真实 provider 超时/重试/错误码由 `T0021` backend 负责；模型层 parser 的显式抛错契约是 backend 选择 fallback 的依据。
- 当前 LLM 输出分数采用「拒绝非法值」策略，任何越界或非法类型都会导致整个 `SimulationRun` 失败。backend 需要将其转换为 deterministic fallback 并标记 `llm_unavailable_fallback_used`。
- `runLlmSimulatedMarket` 不会验证 LLM 是否真正被调用，只验证响应字符串。backend 必须保证只有在 LLM 调用成功时才传入该函数，否则属于「冒充 LLM」。
- 若未来 LLM 输出格式与 prompt schema 不完全一致（例如新增字段或省略数组），parser 会失败。需要保持 prompt schema 与 parser 同步。

## Open Questions

- 是否需要 backend 在 deterministic fallback 路径中显式同时输出 `deterministic_fallback_used` 和 `llm_unavailable_fallback_used`？当前模型层只提供这两个 flag 常量，不替 backend 决定组合方式。
- 后续是否需要为 LLM 响应增加更细粒度的质量标记（如 `llm_response_truncated`、`llm_score_unstable`）？当前未超出 brief 范围。
- 当真实 Minimax 响应被 code fence 包裹时，当前正则支持 ```json 与 ``` 两种 fence；是否需要支持更多 fence 变体（如 ~~~）？当前未超出 brief 范围。

## Contract Drift or Change Requests

- 无。本次实现严格在 brief 列出的 `allowed_paths` 范围内，未触碰 `apps/server`、`apps/web`、DB schema、taxonomy 或真实 Minimax API。

## Memory Candidates

- 模型层 LLM 解析器应显式拒绝非法分数，而不是 silent clamp，这样 backend 才能可靠 fallback。后续涉及 LLM 结构化输出校验时，优先采用「拒绝 + 显式错误」策略。
- 多 agent 反馈必须逐项对应输入 agentId，校验时要同时检查：数量一致、无重复、无未知、无缺失。不能只检查数组长度。
