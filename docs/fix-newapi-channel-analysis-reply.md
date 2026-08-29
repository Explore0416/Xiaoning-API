# 回复：NewAPI 网关 deep 分析渠道问题（已定位根因）

> 对应来函：`docs/fix-newapi-channel-analysis.md`（issue #30 / #38）。
> 结论：**20057 不是 new-api 的错误码，是上游腾讯云 LKEAP 返回的。**触发条件已在网关侧和上游侧各复现 5/5，
> 与"多轮工具"本身无关。
>
> **阻塞已在我方侧解除（2026-08-29）**：已为 `deepseek-v3.2` 增加备用上游，首选渠道报 20057 后
> 重试会自动切到备用渠道，你方无需改请求（详见第 2 节）。第 1 节记录的请求侧改法仍然有效，
> 可作为双保险。另外排查中发现一处**我方网关的缺陷**（省略 `tools[].type` 被转发成 `""`），
> 也已修复并发版。
>
> **补充（2026-08-30 01:00 复测）：上游侧似乎也已修好，20057 当前已无法复现。**同一个触发 body
> 经网关 5/5、直连 LKEAP 3/3 全部 200；生产日志里 20057 共 63 次、全部集中在 2026-08-29
> 20:00–22:01，之后再无一次。备用渠道保留作为兜底（其失败转移已被日志实测验证，见第 2 节）。

## 1. 根因：三个参数同时出现才会触发（2026-08-29 结论，可选的请求侧规避）

> 本节描述的是 2026-08-29 故障期间的复现条件。**2026-08-30 复测已无法再复现**（见第 2 节末），
> 但下面的规避改法仍然有效，可作为双保险留着。

在故障期间，触发 `500 / code 20057 / model engine error` 需要**同时**满足三个条件：

1. `messages` 里含工具调用历史（`assistant` 带 `tool_calls` + `tool` 结果消息）；
2. 请求带 `response_format: {"type": "json_object"}`；
3. 请求带 `parallel_tool_calls: false`。

去掉其中**任意一个**，上游立刻返回 200。最省事的两种改法：

- 在工具循环阶段不要下发 `response_format: {"type":"json_object"}`，只在最后一轮（不再带工具历史时）下发；或
- 删掉 `parallel_tool_calls: false`（或改成 `true`）。

来函第 5 节的最小复现样例**无法复现故障**，因为它没有带 `response_format` / `parallel_tool_calls`
这两个参数——这也是双方之前对不上号的原因。

## 2. 复现证据

以下为 **2026-08-29 故障期间**的实测数据。同一批 body，分别直连上游
`https://api.lkeap.cloud.tencent.com` 和经由 `newapi` 网关，各跑 5 次：

| 用例 | 工具历史 | `tools` | `response_format` | `parallel_tool_calls` | 直连上游 | 经 newapi |
|---|---|---|---|---|---|---|
| 来函请求 A | 无（单轮） | 有 | — | — | 200 ×5 | 200 |
| 来函请求 B | 有 | 有 | — | — | 200 ×5 | 200 |
| Ia | 有 | 有 | — | `false` | 200 ×5 | — |
| Ib | 有 | 有 | `json_object` | — | 200 ×5 | — |
| Ig | 有 | 有 | `json_object` | `true` | 200 ×5 | — |
| J1 | 无（单轮） | 有 | `json_object` | `false` | **200** | 200 |
| J2 | 有 | **无** | `json_object` | `false` | **500 / 20057** | **500 / 20057** |
| **J3** | 有 | 有 | `json_object` | `false` | **500 / 20057** ×5 | **500 / 20057** |

网关返回的响应体与上游逐字一致：

```json
// 直连上游
{"id":"535952d3...","error":{"message":"model engine error","type":"runtime_error","param":null,"code":"20057"}}
// 经 newapi 网关（同一 body）
{"error":{"message":"model engine error","type":"runtime_error","param":"","code":"20057"}}
```

即：网关是**原样透传**上游错误，没有改写、丢字段或吞掉多轮工具消息。

### 20057 归属的旁证

同一个上游用同样的错误格式（`type: "runtime_error"` + 数字 `code`）返回其他错误：

```json
// 同一渠道，把 tool 结果撑到 600KB
{"error":{"message":"input length too long","type":"runtime_error","param":null,"code":"20059"}}
```

腾讯混元渠道也是这个格式（`code: "2000"`, `"内部错误，请稍后重试"`）。
new-api 自身的错误码全是字符串枚举（`bad_response_status_code` / `model_not_found` /
`insufficient_user_quota` / `count_token_failed` …，见 `relaykit/types/error.go`），
没有任何数字错误码，也没有 `runtime_error` 这个 type。

### 同一请求在别的 DeepSeek 上游是 200

把 J3 这个 body（工具历史 + `response_format` + `parallel_tool_calls:false`）原样发给另外两个
DeepSeek 上游：

| 上游 | 模型 | 结果 |
|---|---|---|
| 上游 A（`deepseek-chat`） | deepseek-chat | **200** |
| 上游 B（`DeepSeek-V4-Pro`） | DeepSeek-V4-Pro | **200** |

说明你方的请求**符合 OpenAI 协议**，不是参数用错——是 LKEAP 对这个参数组合的实现有缺陷。

**备用上游已上线（2026-08-29 已验证）。** `deepseek-v3.2` 现在挂在两个渠道上：

| 渠道 | 优先级 | 说明 |
|---|---|---|
| #75 `lkeap.cloud.tencent.com` | 10（高） | 原渠道，仍是首选 |
| #71 `models.sjtu.edu.cn`（vLLM） | 0（低） | 新增备用，内部映射到 `deepseek-chat` |

`default` / `svip` 两个分组都已生效。首选渠道返回 20057 后，重试会落到备用渠道，
**你方不必再改请求**。第 1 节的改法仍然有效，但已不是解除阻塞的必要条件。

失败转移不是纸面配置，生产日志已实测到：2026-08-29 21:43–22:01 共 11 条 `deepseek-v3.2`
请求的落库记录是 `"use_channel":["75","71"]` —— 首选 #75 报错、重试落到 #71 并成功返回。

两点需要你方知情：

- 走备用渠道时，响应里的 `model` 字段会是 `deepseek-chat` 而不是 `deepseek-v3.2`
  （`model_mapping` 只改写请求，不改写响应里的模型标识）。如果你方代码校验响应的
  `model` 必须等于请求的 `model`，需要放宽这个断言。
- 备用渠道是 vLLM 自托管的 `deepseek-chat`，权重/上下文长度与 LKEAP 的 `deepseek-v3.2`
  不完全等同，输出风格可能有差异。

### 2026-08-30 复测：上游侧似乎也修好了，20057 已无法复现

写完上面的结论后又复测了一轮（2026-08-30 01:00 CST），用的是同一个 J3 body
（工具历史 + `tools` + `response_format: json_object` + `parallel_tool_calls: false`）：

| 路径 | 次数 | 结果 |
|---|---|---|
| 经 newapi 网关 | 5 | **200 ×5**，响应 `"model":"deepseek-v3.2"`（即由 #75 直接返回，未走备用） |
| 直连 `api.lkeap.cloud.tencent.com` | 3 | **200 ×3** |

生产日志侧也吻合：20057 一共 63 次，全部落在 2026-08-29 20:00–22:01 这段时间内
（20 时 6 次、21 时 49 次、22 时 8 次），22:01:43 之后再没有出现过；22:02 以后
`deepseek-v3.2` 的请求全部在 #75 上成功。

所以现在的状态是：**上游看起来自己修掉了这个参数组合的问题，备用渠道成了兜底而不是必经之路。**
第 1 节的规避改法从"建议"降级为"可选"。如果后续 20057 复发，你方无需改动——会自动走 #71。

### 另有一处网关侧缺陷，是我方的问题，已修复

排查过程中发现：`tools[]` 元素里的 `type` 字段如果被省略，本网关会把它序列化成
`"type": ""` 再发给上游——而不是按 OpenAI 规范补上默认值 `"function"`。

- 宽松上游（腾讯 LKEAP）不校验这个字段，所以一直没暴露；
- 严格上游（LiteLLM / vLLM 前置网关）会因为 `""` 不在枚举里，直接 `literal_error 400`
  拒掉整个请求。

这个不对称正是缺陷长期隐形的原因：只有当请求**故障转移到严格上游**时才会现形，
且现形时看着像一个跟 20057 毫无关系的 400。**已在网关侧修掉**（省略 `type` 现在等价于
显式声明 `"function"`，`custom` 工具则补 `"custom"`），并加了回归测试断言转发出去的
payload 不可能带空的工具 type。生产已发版验证：

```
# 同一个 vLLM 严格上游，tools[] 故意省略 type
http=200   {"model":"qwen3.6-27b", "system_fingerprint":"vllm-0.21.0-tp4-..."}
```

如果你方之前偶发过"同一份 body 有时 200、有时 400"，很可能就是这个。
（顺带一提，`tools[].function.strict` 目前仍会在转发时被丢弃——如果你方依赖它，请告知，
我方补上。）

### 顺带排除的假设

- **不是长度问题**：500KB body / `prompt_tokens=121812` 仍然 200；600KB 才报 20059（另一个码）。
- **不是 `content: null`**：`null` 和 `""` 都 200。
- **不是 tool schema 复杂度**：带 `enum` / `default` / `additionalProperties:false` / 嵌套 `items` /
  `["string","null"]` 的三工具 schema，200。
- **不是 `max_tokens`**：60 / 8192 / 32768 / 65536 均 200。
- **不是并行工具调用、`tool_choice`、`tool` 消息带 `name`、`arguments` 为空串、`stream: true`、
  两轮以上工具往返、把 `reasoning_content` 回传**：全部 200。

## 3. 关于来函其余四项

| # | 现象 | 实际归属 | 说明 |
|---|---|---|---|
| ① | 500 / 20057 | **上游腾讯 LKEAP** | 见上。已于 2026-08-29 为 `deepseek-v3.2` 增加备用渠道 #71，重试会自动落到备用上游（日志实测 `use_channel:["75","71"]`），阻塞已解除；2026-08-30 复测该错误已无法复现，上游侧似乎也已修好。失败已全额返还预扣费，不产生本地扣费。 |
| ② | 401 `Invalid token` | **调用方 token** | 网关日志记为 `user 0 \| Invalid token`，即该 key 在库里查不到（不是过期、不是余额、不是分组）。7 天内你方两个出口 IP 共约 94 次，和成功请求交替出现——建议核对配置里的 key 是否有多份/是否被轮换过。 |
| ③ | 403 `API Key 所属分组已停用` | **上游** | 上游原文是 `{"code":"GROUP_DISABLED","message":"API Key 所属分组已停用"}`，来自承载 gpt-5.4 / gpt-5.6 的上游聚合站，它那边的 key 分组被停了。我方会换/续这个渠道的 key。 |
| ④ | 403 `用户额度不足, 剩余额度 -0.01` | **上游** | 日志里这条带着上游自己的 request id，是承载 grok-4.5 的上游聚合站账户欠费，不是你方在本网关的额度。我方会充值或摘掉该渠道。 |
| ⑤ | 503 `No available channel ... under group svip` | **我方配置** | 属实：`deepseek-v4-pro` 只挂在一个已停用渠道上，`minimax-m3` 完全没有配置渠道。这两个模型请先从候选列表移除，我方补渠道后再通知。 |
| — | kimi-k3 200 但不返回 `tool_calls` | **上游** | 承载 kimi-k3 的上游不吐 `tool_calls`，网关无法凭空构造。建议候选列表按"实测能返回 tool_calls"筛一遍。 |

## 4. 关于"按 request id 查日志"（已修好，可以查了）

这条建议之前查不到东西：本网关 `ERROR_LOG_ENABLED` 未开启（默认 `false`），失败请求不写入 `logs` 表。
**该开关已于 2026-08-29 在生产开启并验证生效**，现在失败请求会落库，每条记录带：

```json
{"channel_id":75,"channel_name":"lkeap.cloud.tencent.com","channel_type":1,
 "error_code":"20057","error_type":"openai_error",
 "request_path":"/v1/chat/completions","status_code":500,
 "admin_info":{"use_channel":["75","75","75","75","75","75"]}}
```

`error_code` 就是上游原始码（20057），`use_channel` 能看到 6 次重试全部落在同一渠道。
后续你方给 request id，我方可以直接定位到 `error_code` / `status_code` / `channel_id`。

另外网关的渠道错误日志行此前只打印 message、不打印上游 `code`，所以 `grep 20057` 搜不到——
这一点也已修好并发版（日志行格式现在是
`channel error (channel #%d, status code: %d, error code: %s): %s`），生产已生效。

## 5. 建议的最小验证步骤（你方）

```bash
# 只改 parallel_tool_calls，其余保持你方真实 payload
curl -s https://newapi.binbim.top/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-v3.2",
       "messages":[{"role":"user","content":"read src/main.ts"},
                   {"role":"assistant","content":null,"tool_calls":[{"id":"call_x","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"src/main.ts\"}"}}]},
                   {"role":"tool","tool_call_id":"call_x","content":"console.log(1)"},
                   {"role":"user","content":"final analysis"}],
       "tools":[{"type":"function","function":{"name":"read_file","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}}}],
       "response_format":{"type":"json_object"},
       "max_tokens":60}'
```

上面这条（有 `response_format`、无 `parallel_tool_calls: false`）应当返回 200。
加上 `"parallel_tool_calls": false` 后，按 2026-08-30 的复测结果也应当返回 200
（8/8 全部成功，见第 2 节末），响应里 `model` 字段为 `deepseek-v3.2`。
若 20057 复发，重试会自动切到备用渠道 #71，最终你方拿到的仍应是 200，
只是那种情况下 `model` 字段会变成 `deepseek-chat`。
如果最终仍拿到 500，请把 request id 发我方，可以直接定位到 `error_code` / `channel_id`。

确认后即可重新打开 `issue_deep_analysis`。
