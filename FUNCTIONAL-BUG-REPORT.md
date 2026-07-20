# NewAPI (QuantumNous/new-api) 功能 Bug 审计报告

> **审计日期**: 2026-07-09
> **项目仓库**: https://github.com/QuantumNous/new-api
> **审计范围**: 后端功能逻辑、Relay 代理转发、前端交互
> **声明**: 本报告为功能问题清单，基于静态代码分析。具体影响需在运行环境中验证。

---

## 汇总

| 类别 | 高严重度 | 中严重度 | 低严重度 | 合计 |
|------|---------|---------|---------|------|
| 上游模型检测 | 4 | 3 | 3 | **10** |
| Relay/路由/转换 | 4 | 10 | 4 | **18** |
| 前端功能/UX | 4 | 5 | 4 | **13** |
| **总计** | **12** | **18** | **11** | **41** |

---

# 第一部分：上游模型检测功能 Bug（10个）

## 你提到的核心问题：POST `FetchModels` 不是真正的自动检测接口

**根本原因**: 项目中存在**两个**获取模型的端点——

| 端点 | 方法 | 路径 | 质量 |
|------|------|------|------|
| `FetchUpstreamModels` | GET | `/api/channel/fetch_models/:id` | **完整实现** — 支持渠道类型路由、代理、认证头适配 |
| `FetchModels` | POST | `/api/channel/fetch_models` | **严重退化** — 仅有 Ollama 和 Gemini 有专用处理，其余全部走裸 `/v1/models` |

前端"创建渠道前获取模型列表"使用的是 **POST 端点**（退化版本），而"已创建渠道的更新模型"使用的是 **GET 端点**（完整版本）。这就是为什么你感觉"不是真正的自动检测"。

---

### Bug FM-1. Anthropic 渠道永远 401 Unauthorized

**文件**: `controller/channel.go:1222-1277`

```go
// 行1222-1234: POST FetchModels 的通用路径
client := &http.Client{}
url := fmt.Sprintf("%s/v1/models", baseURL)
request, err := http.NewRequest("GET", url, nil)
// ...
request.Header.Set("Authorization", "Bearer "+key)  // ← 错误！
```

**对比 GET 端点的正确实现** (`controller/channel_upstream_update.go:320-321`):
```go
headers := buildFetchModelsHeaders(channel)  // ← 委托给 GetClaudeAuthHeader
// → controller/channel-billing.go:132-137:
// headers.Set("x-api-key", apiKey)
// headers.Set("anthropic-version", "2023-06-01")
```

**问题**: Anthropic 要求 `x-api-key` + `anthropic-version` 头，但 POST 端点使用 `Authorization: Bearer`。每次测试 Anthropic 渠道都返回 401。

**影响**: 所有 Anthropic (Claude) 渠道在创建前无法自动检测模型。

---

### Bug FM-2. HTTP 响应体泄漏（每次失败都泄漏 TCP 连接）

**文件**: `controller/channel.go:1244-1252`

```go
response, err := client.Do(request)
// ...
if response.StatusCode != http.StatusOK {
    c.JSON(http.StatusInternalServerError, gin.H{...})
    return  // ← return 在 Close 之前！
}
defer response.Body.Close()  // ← 只在 200 时执行
```

**正确做法** (`relay/channel/ollama/relay-ollama.go:299`):
```go
defer response.Body.Close()  // ← 在 status check 之前
if response.StatusCode != http.StatusOK { ... }
```

**影响**: 每次上游返回错误（401/403/404），TCP 连接泄漏。持续操作会耗尽文件描述符。

---

### Bug FM-3. 缺少渠道类型专属端点路由

**文件**: `controller/channel.go:1223`

```go
url := fmt.Sprintf("%s/v1/models", baseURL)  // ← 所有渠道都用 /v1/models
```

**对比 GET 端点的正确实现** (`controller/channel_upstream_update.go:288-312`):
```go
switch channel.Type {
case common.ChannelTypeAli:
    url = baseURL + "/compatible-mode/v1/models"  // 阿里需要不同端点
case common.ChannelTypeZhipu4:
    url = baseURL + "/api/paas/v4/models"         // 智谱需要不同端点
// ... 更多渠道类型
}
```

**影响**: 阿里、智谱、VertexAI 等渠道测试时返回 404。

---

### Bug FM-4. 通用路径无代理支持

**文件**: `controller/channel.go:1222`

```go
client := &http.Client{}  // ← 裸 client，不支持渠道代理
```

**对比**: GET 端点使用 `service.NewProxyHttpClient(channel.GetSetting().Proxy)`。

**影响**: 需要代理才能访问上游的环境下，模型检测全部失败。

---

### Bug FM-5. 通用路径无 HTTP 超时

**文件**: `controller/channel.go:1222`

```go
client := &http.Client{}  // ← 无 Timeout 字段
```

**对比**: Gemini 专用路径使用 `context.WithTimeout(ctx, 30*time.Second)`。

**影响**: 上游响应慢时，前端请求无限挂起。

---

### Bug FM-6. 不支持的渠道类型无明确错误提示

**文件**: `controller/channel.go:1183-1277`

AWS Bedrock (type 33)、Vertex AI (type 41)、Cohere (type 34)、Dify (type 37)、Replicate (type 56) 等均有非 OpenAI 兼容的 API 格式。POST 端点尝试用 `/v1/models` 请求，返回混乱的解析错误。

**预期**: 返回明确提示 "此渠道类型不支持模型列表获取"。

---

### Bug FM-7. GetResponseBody 响应体泄漏

**文件**: `controller/channel-billing.go:151-167`

```go
func GetResponseBody(method, url string, channel *model.Channel, headers http.Header) ([]byte, error) {
    res, err := client.Do(req)
    if err != nil { return nil, err }
    if res.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("status code: %d", res.StatusCode)  // ← body 未关闭！
    }
    body, err := io.ReadAll(res.Body)
    // ...
    err = res.Body.Close()
}
```

**影响**: 所有余额检查和模型获取（GET 端点）在上游返回错误时都泄漏连接。

---

### Bug FM-8. POST 与 GET 端点 HTTP 状态码不一致

| 端点 | 上游错误时的 HTTP 状态码 |
|------|------------------------|
| POST `FetchModels` | 500 Internal Server Error |
| GET `FetchUpstreamModels` | 200 OK + `{success: false}` |

项目惯例是 HTTP 200 + `{success: false}`，POST 端点违反了此惯例。

---

### Bug FM-9. Ollama 获取模型无超时

**文件**: `relay/channel/ollama/relay-ollama.go:284`

```go
client := &http.Client{}  // ← 无 Timeout
```

Ollama 部署在远程时，慢响应导致无限挂起。

---

### Bug FM-10. 通知逻辑零值返回 true

**文件**: `controller/channel_upstream_update.go:419-422`

```go
func shouldSendUpstreamModelUpdateNotification(now int64, changedChannels int, failedChannels int) bool {
    if changedChannels <= 0 && failedChannels <= 0 {
        return true  // ← 无变化时返回"应发送通知"
    }
}
```

当前调用方在调用前检查了计数，所以暂未触发。但语义错误，未来调用方可能误用。

---

# 第二部分：Relay/路由/转换功能 Bug（18个）

---

### Bug R-1. Gemini FunctionResponse 的 tool_call_id 始终为 call_0 [高]

**文件**: `service/convert.go:706-722`

```go
// FunctionCall（在 assistant 响应中）:
ID: fmt.Sprintf("call_%d", len(toolCalls)+1),  // → "call_1"

// FunctionResponse（在 user 请求中）:
ToolCallId: fmt.Sprintf("call_%d", len(toolCalls)),  // → "call_0"（toolCalls 在此处为空！）
```

**问题**: FunctionCall 和 FunctionResponse 永不在同一个循环中。处理 user message 时 `toolCalls` 已重置为空，所以所有 FunctionResponse 的 ID 都是 `call_0`，与 FunctionCall 的 `call_1` 不匹配。

**影响**: Gemini Function Calling 多轮对话失败——模型找不到对应的函数调用结果。

---

### Bug R-2. BillingSession.Settle 资金泄漏 [高]

**文件**: `service/billing_session.go:41-78`

```go
func (s *BillingSession) Settle(actualQuota int) error {
    // ...
    if !s.fundingSettled {
        if err := s.funding.Settle(delta); err != nil { return err }
        s.fundingSettled = true  // ← 钱包已扣款
    }
    // Token 额度调整
    tokenErr = model.DecreaseTokenQuota(...)
    if tokenErr != nil {
        common.SysLog(...)  // ← 仅打日志，不回滚！
    }
    s.settled = true  // ← 即使 token 调整失败也标记已结算
    return tokenErr
}
```

**问题**: 钱包扣款成功但 Token 额度调整失败时，不回滚钱包扣款，且 `settled=true` 阻止后续 Refund。

**影响**: 用户钱包被扣款但 Token 额度未正确调整——资金泄漏。

---

### Bug R-3. Claude-to-OpenAI 混合文本和工具调用时丢失文本 [中]

**文件**: `service/convert.go:200-211`

```go
if len(toolCalls) > 0 {
    openAIMessage.SetToolCalls(toolCalls)
}
if len(mediaMessages) > 0 && len(toolCalls) == 0 {  // ← 有 toolCalls 时跳过文本！
    openAIMessage.SetMediaContent(mediaMessages)
}
```

**问题**: Claude 原生支持一条消息同时包含 text 和 tool_use。但转换时如果有 toolCalls，文本内容被完全丢弃。

**影响**: 使用 Claude 原生多模态+工具调用的请求丢失正文。

---

### Bug R-4. NormalizeCacheCreationSplit 缓存费率归类错误 [中]

**文件**: `service/convert.go:250-253`

```go
func NormalizeCacheCreationSplit(totalTokens int, tokens5m int, tokens1h int) (int, int) {
    remainder := lo.Max([]int{totalTokens - tokens5m - tokens1h, 0})
    return tokens5m + remainder, tokens1h  // ← remainder 全部加到 5m 费率
}
```

**问题**: 无法分类的缓存写入 tokens 全部按 5 分钟费率计费，而非更便宜的 1 小时费率。

**影响**: 使用 Claude 缓存的用户被多收费。

---

### Bug R-5. Auto Group 跨组重试逻辑缺陷 [中]

**文件**: `service/channel_select.go:107-155`

```go
for i := startGroupIndex; i < len(autoGroups); i++ {
    priorityRetry := param.GetRetry()
    if i > startGroupIndex {
        priorityRetry = 0  // ← 切换到新分组时重置为 0
    }
    // ...
    if crossGroupRetry && priorityRetry >= common.RetryTimes {
        // ← 永远不为真，因为 priorityRetry 刚被重置为 0
    }
}
```

**问题**: 切换到新分组后 `priorityRetry` 被重置为 0，导致 `>= RetryTimes` 条件永远不满足，无法在该分组内正确重试。

---

### Bug R-6. StreamStatus 生命周期被覆盖 [中]

**文件**: `relay/helper/stream_scanner.go:65`

```go
func StreamScannerHandler(c *gin.Context, resp *http.Response, ...) {
    info.StreamStatus = relaycommon.NewStreamStatus()  // ← 无条件新建，覆盖历史
}
```

**问题**: 重试场景下，之前的错误历史和 soft error 计数被覆盖。

---

### Bug R-7. Coze 适配器仅发送 user 消息 [中]

**文件**: `relay/channel/coze/relay-coze.go:23-35`

```go
func convertCozeChatRequest(...) *CozeChatRequest {
    for _, message := range request.Messages {
        if message.Role == "user" {  // ← 只处理 user！
            messages = append(messages, ...)
        }
    }
}
```

**问题**: 完全丢弃 assistant、system、tool 角色的消息，多轮对话上下文丢失。

---

### Bug R-8. Claude 流式转换 reasoning 和 content 共存时丢失正文 [中]

**文件**: `service/convert.go:534-574`

```go
if reasoning != "" {
    claudeResponse.Delta = &dto.ClaudeMediaMessage{Type: "thinking_delta", ...}
} else {  // ← reasoning 存在时，text 分支被跳过！
    claudeResponse.Delta = &dto.ClaudeMediaMessage{Type: "text_delta", ...}
}
```

**问题**: 上游同时返回 `reasoning_content` 和 `content` 时，正文被静默丢弃。

---

### Bug R-9. HTTP Client 无默认超时 [中]

**文件**: `service/http_client.go:68-79`

```go
if common.RelayTimeout == 0 {
    httpClient = &http.Client{
        Transport:     transport,
        CheckRedirect: checkRedirect,
        // ← 无 Timeout！
    }
}
```

**影响**: `RELAY_TIMEOUT` 未设置时，所有非流式请求可无限等待。

---

### Bug R-10. ConvertRerankRequest 返回 nil, nil [中]

**文件**: 多个适配器（claude/gemini/aws 等）

```go
func (a *Adaptor) ConvertRerankRequest(...) (any, error) {
    return nil, nil  // ← 无返回值无错误
}
```

**影响**: 调用方不检查 nil 时 panic。

---

### Bug R-11. ClaudeHandler usage 类型断言无保护 [中]

**文件**: `relay/claude_handler.go:221`

```go
service.PostTextConsumeQuota(c, info, usage.(*dto.Usage), nil)
// ← 如果 usage 不是 *dto.Usage，直接 panic
```

**修复**: 使用 `usage, ok := usage.(*dto.Usage)` comma-ok 模式。

---

### Bug R-12. 60+ 个未实现的适配器方法 [中]

大量适配器的 `ConvertAudioRequest`、`ConvertImageRequest`、`ConvertEmbeddingRequest`、`ConvertRerankRequest` 等直接返回 `errors.New("not implemented")`，但错误信息模糊。

---

### Bug R-13. SSE 格式化不规范 [中]

部分 SSE 事件格式不符合 `event: <type>\ndata: <json>\n\n` 规范，可能导致客户端解析失败。

---

### Bug R-14. SSE [DONE] 识别边界条件 [低-中]

**文件**: `relay/helper/stream_scanner.go:234-240`

```go
if len(data) < 6 { continue }  // ← "data:" (5字符) 被过滤！
```

---

### Bug R-15. Gemini Stop Sequences 截断无警告 [低]

**文件**: `service/convert.go:758-761`

```go
openaiRequest.Stop = geminiRequest.GenerationConfig.StopSequences[:4]
// ← 超过4个时静默截断
```

---

### Bug R-16. 敏感信息过滤不一致 [中]

`ClaudeErrorWrapper` 将错误替换为固定文本，`TaskErrorWrapper` 用 `MaskSensitiveInfo` 掩码，行为不一致。

---

### Bug R-17. 敏感内容审查缺口 [中]

**文件**: `service/sensitive.go:20`

```go
// TODO: check image url  ← 图片 URL 未做审查
```

---

### Bug R-18. 临时处理代码标注 TODO [低]

| 文件 | 行号 | 内容 |
|------|------|------|
| `relay/claude_handler.go` | 99 | `// TODO: 临时处理` |
| `relay/channel/claude/relay-claude.go` | 200 | `// TODO: 临时处理` |
| `setting/ratio_setting/model_ratio.go` | 22 | `// TODO: when a new api is enabled, check the pricing here` |
| `controller/channel-billing.go` | 466 | `// TODO: support Azure` |

---

# 第三部分：前端功能/UX Bug（13个）

---

### Bug F-1. Classic 前端认证表单缺少 e.preventDefault() [高]

**文件**:
- `web/classic/src/components/auth/LoginForm.jsx:218`
- `web/classic/src/components/auth/RegisterForm.jsx:218`
- `web/classic/src/components/auth/PasswordResetForm.jsx:82`
- `web/classic/src/components/auth/PasswordResetConfirm.jsx:83`

```javascript
async function handleSubmit(e) {
    // ... 没有 e.preventDefault()
}
```

**影响**: 用户在输入框中按 Enter 时，浏览器原生表单提交触发页面刷新，异步处理被打断。

---

### Bug F-2. PasswordResetConfirm 缺少 try/catch [高]

**文件**: `web/classic/src/components/auth/PasswordResetConfirm.jsx:83-104`

```javascript
async function handleSubmit(e) {
    // ...
    const res = await API.post(`/api/user/reset`, { email, token });  // ← 无 try/catch！
    // ...
    setLoading(false)  // ← 网络错误时永远不执行，UI 永久 loading
}
```

**影响**: 网络错误时组件崩溃，UI 永久卡在加载状态。

---

### Bug F-3. Default 前端双重 Toast 通知 [高]

**文件**: `web/default/src/lib/api.ts:81-98`

```typescript
// 全局拦截器
if (!response.data.success) {
    toast.error(response.data.message || t('Request failed'))  // Toast #1
}
```

加上各组件 catch 块中的 `toast.error()` → Toast #2。

**影响**: 同一错误显示两个错误通知。

---

### Bug F-4. 批量启用/禁用同时显示成功和错误 Toast [高]

**文件**: `web/default/src/features/channels/lib/channel-actions.ts:448-470`

```typescript
if (successCount > 0) {
    toast.success(...)  // ← 显示成功
}
if (failCount > 0) {
    toast.error(...)   // ← 同时显示错误
}
```

**影响**: 部分成功时，用户同时看到成功和错误通知，无法判断净结果。

---

### Bug F-5. "测试所有渠道" 不自动刷新结果 [中]

**文件**: `web/default/src/features/channels/lib/channel-actions.ts:665-687`

```typescript
toast.success('Testing all enabled channels started. Please refresh to see results.')
queryClient?.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
// ← 但后端测试需要时间，刷新拿到的是旧数据
// ← 没有自动轮询机制
```

**影响**: 用户必须手动刷新页面才能看到结果。

---

### Bug F-6. "删除失败模型" 忽略行选择 [中]

**文件**: `web/default/src/features/channels/components/dialogs/channel-test-dialog.tsx:767-817`

```typescript
const handleDeleteFailedModels = useCallback(async () => {
    const failed = models.filter(model => testResults[model]?.status === 'error')
    // ← 删除所有失败模型，忽略 rowSelection
})
```

**影响**: 用户选了特定行但操作作用于所有失败项。

---

### Bug F-7. 批量测试完成后清除行选择 [中]

**文件**: `web/default/src/features/channels/components/dialogs/channel-test-dialog.tsx:744`

```typescript
} finally {
    setRowSelection({})  // ← 无条件清除选择
    refreshChannelLists(resultPatch)
}
```

**影响**: 用户无法在测试后对已选模型进行批量操作。

---

### Bug F-8. staleTime: 0 导致过度请求 [中]

**文件**: `web/default/src/features/keys/components/api-keys-columns.tsx:56`

```typescript
useQuery({ queryKey: ['user-models'], queryFn: getUserModels, staleTime: 0 })
// ← 全局 staleTime 是 10秒，这里覆盖为 0
```

**影响**: 每次组件渲染都触发后台请求，浪费带宽。

---

### Bug F-9. 测试连接仅测试连通性，不测试模型可用性 [中]

**文件**: `web/default/src/features/channels/api.ts:213-221`

前端 "Test Connection" 按钮调用时不传 `model` 参数 → 后端只测试 API Key 有效性 → 渠道可能通过测试但实际无法使用特定模型。

**影响**: 绿色通过指示器具有误导性。

---

### Bug F-10. "删除 0 个禁用渠道" 成功提示 [低]

**文件**: `web/default/src/features/channels/lib/channel-actions.ts:607-629`

```typescript
toast.success(i18next.t('{{count}} disabled channel(s) deleted', { count: response.data || 0 }))
// ← 0 个时显示 "0 disabled channel(s) deleted"
```

---

### Bug F-11. 生产代码残留 console.log [低]

**文件**: `web/default/src/features/channels/components/channels-primary-buttons.tsx:300,319`

```typescript
console.log(`Deleted ${_count} channels`)
console.log('Repair channel consistency result:', _result)
```

---

### Bug F-12. Classic 前端表单无 HTML5 验证属性 [低]

登录/注册/密码重置表单的 `<Input>` 缺少 `required`、`maxLength`、`pattern` 等属性。虽有 JS 验证但用户体验差。

---

### Bug F-13. 渠道测试期间不禁用其他操作按钮 [低]

**文件**: `web/default/src/features/channels/components/data-table-row-actions.tsx:109-119`

测试按钮只禁用自身，删除/复制/状态切换按钮仍可点击。用户可能在测试进行中误操作。

---

# 总结：最关键的 10 个功能 Bug

| 排名 | 编号 | 问题 | 影响 |
|------|------|------|------|
| 1 | **R-2** | BillingSession 资金泄漏 | 用户钱包被扣但额度未调整 |
| 2 | **R-1** | Gemini tool_call_id 不匹配 | Function Calling 多轮对话失败 |
| 3 | **FM-1~4** | POST FetchModels 严重退化 | Anthropic/阿里/智谱渠道无法自动检测模型 |
| 4 | **FM-2** | 响应体泄漏 | 持续操作耗尽文件描述符 |
| 5 | **R-8** | reasoning+content 共存丢失正文 | 带思考的模型返回空正文 |
| 6 | **R-4** | 缓存费率归类错误 | 用户被多收费 |
| 7 | **R-3** | Claude 混合消息丢失文本 | 多模态+工具调用丢失正文 |
| 8 | **F-1** | 表单缺少 preventDefault | 输入框按 Enter 页面刷新 |
| 9 | **R-7** | Coze 仅发 user 消息 | 多轮对话上下文丢失 |
| 10 | **F-3** | 双重 Toast | 每个错误显示两次 |

---

*报告结束。审计日期：2026-07-09。共发现 41 个功能 Bug（12 高 / 18 中 / 11 低）。*
