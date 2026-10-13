# NewAPI 网关 Deep 分析渠道问题分析

> 用途：转交 newapi 网关维护者，或自留排查。相关 issue：#30（deep 行号标注）、#38（分析未触发）。

## 1. 场景背景

AperturePrism-AI-Review（自建 AI 审核系统）通过 `newapi.binbim.top`（OpenAI 兼容网关）调用模型做 Issue 深度分析（deep）。deep 让模型**多轮调用工具**（`read_file` / `list_directory` / `get_git_info` 读取仓库源码），再产出带**代码行号（locator）**的结果。这条多轮工具链路当前被网关故障阻断。

## 2. 观测到的故障形态

| # | 现象 | HTTP / 错误 | 触发场景 | 已复现模型 |
|---|---|---|---|---|
| ① | engine error | `500 / code 20057 "model engine error" (runtime_error)` | deep **多轮工具**请求 | deepseek-v3.2（单轮工具 200，多轮 500）|
| ② | token 失效 | `401 Invalid token (new_api_error)` | 08-28 多个分析任务 | 当时 kimi-k3 曾触发，现单轮正常 |
| ③ | 分组停用 | `403 [bad_response_status_code] API Key 所属分组已停用` | 请求该模型 | gpt-5.4 / gpt-5.6 |
| ④ | 额度不足 | `403 insufficient_user_quota 剩余额度 -0.01` | — | grok-4.5 |
| ⑤ | 无渠道 | `503 model_not_found No available channel ... under group svip` | — | deepseek-v4-pro / minimax-m3 |

## 3. 关键技术特征

- 端点：`POST {base}/v1/chat/completions`，`Authorization: Bearer <token>`（token 来自系统配置，普通单轮对话请求可正常调用）。
- 请求体含：`model`、`messages`、`tools`（函数定义 JSON Schema）。
- **故障点在"多轮"，而不是"首次工具请求"**：
  - **首次带 tools 请求 → 200，能正确返回 `tool_calls`**（已验证 deepseek-v3.2 / claude-opus-5 / claude-sonnet-5 / glm-5.2 / glm-5 / qwen3.5 / gpt-5.5 / step-3.7-flash / mistral-medium-3.5 等）。
  - **把上一步的 `tool_calls` 以 `assistant`（带 tool_calls）+ 若干 `tool`（带 tool_call_id）消息回传的后续请求 → 触发 20057 / 500**。
- 这是标准 OpenAI 函数调用协议，字段必须为蛇形：`tool_calls` / `tool_call_id`（系统曾在 v1.0.76 修复过驼峰问题）。

## 4. 建议排查步骤（newapi 后台）

1. **按 request id 查日志**：错误体带 `request id: 20260829...`，到 newapi → 日志/渠道日志搜该 id，看它在**下游渠道层**的真实请求与响应。
2. **重点查 20057 的渠道侧**：20057 是 new-api 私有错误码，表示**上游渠道返回引擎错误**。查该模型（如 deepseek-v3.2）绑定上游渠道：
   - 上游 API 类型 / 地址是否正确；
   - 渠道是否支持 **tool_calls / tool role 消息透传**（不支持 function calling 的上游会在多轮时报 engine error）；
   - 渠道 key 是否有效、额度是否充足、是否被限流/超时。
3. **最小复现**（见第 5 节请求样例）：
   - 请求 A：带 `tools`，拿回 `tool_calls`；
   - 请求 B：把 `assistant`(tool_calls) + `tool`(结果) 作为历史再次请求；
   - 若 A 200、B 500 → 定位渠道对"多轮工具"的支持/路由是否有问题。
4. **排查 401**：查该 token 对应用户/分组对这些模型的权限与配额配置；渠道 key 是否轮换后未同步。
5. **排查 403 / 503**：在「分组 / 额度 / 渠道」页面调整分组权限、续 key、为模型配置可用渠道。

## 5. 最小复现请求样例

**请求 A**：

```json
POST /v1/chat/completions
{
  "model": "deepseek-v3.2",
  "messages": [
    { "role": "user", "content": "请调用 read_file 读取 src/main.ts" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "read a file",
        "parameters": {
          "type": "object",
          "properties": { "path": { "type": "string" } },
          "required": ["path"]
        }
      }
    }
  ],
  "max_tokens": 60
}
```

> 预期：`choices[0].message.tool_calls`（HTTP 200）。

**请求 B（触发 20057 的后续请求）**：

```json
POST /v1/chat/completions
{
  "model": "deepseek-v3.2",
  "messages": [
    { "role": "user", "content": "请调用 read_file 读取 src/main.ts" },
    {
      "role": "assistant",
      "content": null,
      "tool_calls": [
        {
          "id": "call_x",
          "type": "function",
          "function": { "name": "read_file", "arguments": "{\"path\":\"src/main.ts\"}" }
        }
      ]
    },
    { "role": "tool", "tool_call_id": "call_x", "content": "...文件内容..." },
    { "role": "user", "content": "基于读取到的内容输出最终分析" }
  ],
  "tools": [ /* 同请求 A */ ]
}
```

> 观察是否返回 `500 / code 20057`。

---

## 附：推进历史（供上下文）

- 开关 `issue_deep_analysis`：线上曾开启后关闭；当前为 `false`（待渠道修复后再开）。
- 候选模型实测结论（单轮 tools，newapi 网关）：
  - ✅ 支持工具且可调用：deepseek-v3.2 / deepseek-v3.1 / deepseek-r1 / claude-opus-5 / claude-sonnet-5 / glm-5.2 / glm-5 / qwen3.5 / gpt-5.5 / step-3.7-flash / mistral-medium-3.5。
  - ⚠️ kimi-k3：200 但**不返回 tool_calls**（deep 不稳根因）。
  - ❌ 不可用：gpt-5.4 / gpt-5.6（分组停用 403）、grok-4.5（余额负）、deepseek-v4-pro / minimax-m3（无渠道 503）、deepseek-v4-flash（超时）。
- 代码侧：`runToolLoop` 已对"既有 content 也无 tool_calls"的空响应做重试（v1.0.88），但无法覆盖网关 20057 之类的渠道错误。