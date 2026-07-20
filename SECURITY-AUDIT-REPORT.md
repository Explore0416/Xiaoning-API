# NewAPI (QuantumNous/new-api) 安全审计报告

> **审计日期**: 2026-07-09
> **项目仓库**: https://github.com/QuantumNous/new-api
> **技术栈**: Go 1.22 + Gin + GORM + React (TanStack Router) + PostgreSQL/MySQL/SQLite + Redis
> **审计方法**: 4 并行代理自动化代码审计 + 人工模式匹配 + GitHub Security Advisory 数据库检索 + 内部审计清单交叉比对
> **声明**: 本报告为问题清单，不构成修复完成证明。具体修复状态请以代码 diff、测试结果和部署验证为准。

---

## 目录

- [第一部分：已知公开漏洞（13个 CVE/GHSA）](#第一部分已知公开漏洞13个-cveghsa)
- [第二部分：本次代码审计发现（44个）](#第二部分本次代码审计发现44个)
  - [P0 严重（8个）](#p0--严重漏洞8个)
  - [P1 高危（12个）](#p1--高危漏洞12个)
  - [P2 中危（16个）](#p2--中危漏洞16个)
  - [P3 低危（8个）](#p3--低危漏洞8个)
- [第三部分：稳定性与性能问题（8个）](#第三部分稳定性与性能问题8个)
- [第四部分：修复路线图与检查清单](#第四部分修复路线图与检查清单)

---

# 第一部分：已知公开漏洞（13个 CVE/GHSA）

以下为 QuantumNous/new-api 在 GitHub Security Advisories 中披露的全部 13 个安全公告。

## EXT-1. 用户列表 API 泄露 Root Access Token — 权限提升

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-6x2c-phff-wx57 |
| **严重程度** | **CRITICAL** (CVSS 3.1: 9.1) |
| **CWE** | CWE-200（敏感信息泄露） |
| **受影响版本** | < v1.0.0-rc.7 |
| **修复版本** | v1.0.0-rc.7 |
| **披露日期** | 2026-07-03 |
| **报告者** | August829 |

**漏洞描述**：`User.AccessToken` 字段使用 `json:"access_token"` 序列化标签。管理员调用 `GET /api/user/` 获取用户列表时，响应体中包含所有用户（包括 Root）的 Access Token。攻击者利用此 Token 可冒充 Root 用户访问系统配置、支付设置、OAuth/SMTP 等敏感 API，实现完全系统接管。

**根因代码**（修复前）：
```go
// model/user.go — 修复前
type User struct {
    AccessToken *string `json:"access_token" gorm:"type:char(32);column:access_token;uniqueIndex"`
    // ...
}
```

**修复方案**：将序列化标签改为 `json:"-"`，阻止 Token 在任何 API 响应中出现。**升级后应轮换所有已泄露的 Access Token。**

---

## EXT-2. Stripe Webhook 空密钥签名绕过 — 无限配额欺诈

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-xff3-5c9p-2mr4 |
| **CVE** | CVE-2026-41432 |
| **严重程度** | HIGH (CVSS 3.1: 7.1) |
| **CWE** | CWE-345, CWE-863, CWE-1188 |
| **受影响版本** | < v0.12.10 |
| **修复版本** | v0.12.10 |
| **披露日期** | 2026-04-22 |
| **报告者** | ChangeYu0229 |

**漏洞描述**：三个复合缺陷——
1. `StripeWebhookSecret` 默认为空字符串，Stripe SDK 对空密钥计算 HMAC 不报错，攻击者可用空密钥伪造合法签名
2. `sessionCompleted` 仅检查 `status == "complete"` 但不检查 `payment_status == "paid"`
3. `model.Recharge()` 仅按 `trade_no` 查找订单，不校验 `PaymentMethod` 是否匹配

**攻击场景**：攻击者创建 Epay 1元订单 → 获取 trade_no → 用空密钥伪造 Stripe webhook → 跨网关完成订单 → 获得无限配额。

**临时缓解**：设置 `StripeWebhookSecret` 为任意非空字符串；未使用 Stripe 时在反向代理中屏蔽 `/api/stripe/webhook`。

---

## EXT-3. SSRF 保护绕过 — 0.0.0.0 漏洞

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-v5c3-6wvc-pc2q |
| **CVE** | CVE-2026-42339 |
| **严重程度** | HIGH |
| **CWE** | CWE-918（SSRF） |
| **受影响版本** | <= v0.11.9-alpha.1 |
| **修复版本** | **未指定** |
| **披露日期** | 2026-05-06 |
| **报告者** | MeeseeksX |

**漏洞描述**：`isPrivateIP()` 未检查 `0.0.0.0/8` 段。Linux 上 `0.0.0.0` 等同 localhost。普通用户（无需管理员）通过 `image_url.url = "http://0.0.0.0:8080/..."` 即可绕过 SSRF 过滤。当请求路由到 AWS Bedrock Claude 时，获取的内容内联到模型响应，升级为**完全可读 SSRF**。

**PoC**：
```http
POST /v1/chat/completions HTTP/1.1
Authorization: Bearer sk-<user-token>

{
  "model": "gpt-4o-mini",
  "stream": true,
  "max_tokens": 1,
  "messages": [{"role": "user", "content": [
    {"type": "text", "text": "describe"},
    {"type": "image_url", "image_url": {"url": "http://0.0.0.0:8080/probe.png"}}
  ]}]
}
```
响应：`dial tcp 0.0.0.0:8080: connect: connection refused`（确认 SSRF 绕过）

**注意**：修复版本为空，可能仍未完全修复。

---

## EXT-4. SSRF 保护绕过 — 未解析域名通知 URL

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-6qcr-qxgr-m7fv |
| **CVE** | CVE-2026-33655 |
| **严重程度** | HIGH (CVSS 3.1: 7.7) |
| **CWE** | CWE-918（SSRF） |
| **受影响版本** | < v0.12.0-alpha.1 |
| **修复版本** | v0.12.0-alpha.1 |
| **披露日期** | 2026-07-03 |
| **报告者** | b-hermes |

**漏洞描述**：`ApplyIPFilterForDomain` 默认为 false，通知 URL（Webhook/Bark/Gotify）的域名不被解析和 IP 过滤。普通用户可将通知指向内网服务（如 `http://169.254.169.254`）。

---

## EXT-5. MarkdownRenderer XSS — `<script>` 标签执行

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-299v-8pq9-5gjq |
| **CVE** | CVE-2026-25802 |
| **严重程度** | HIGH (CVSS 3.1: 7.6) |
| **受影响版本** | <= v0.10.8-alpha.8 |
| **修复版本** | v0.10.8-alpha.9 |
| **披露日期** | 2026-02-22 |
| **报告者** | small-lovely-cat, TechnologyStar |

**漏洞描述**：`MarkdownRenderer.jsx` 使用 `dangerouslySetInnerHTML` 渲染模型输出。当模型被诱导输出含 `<script>` 标签的 Markdown 时，脚本在浏览器中执行。聊天记录中存储的恶意脚本会在重新打开时再次执行（存储型 XSS）。

---

## EXT-6. SQL LIKE 通配符注入 DoS

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-w6x6-9fp7-fqm4 |
| **CVE** | CVE-2026-25591 |
| **严重程度** | HIGH |
| **CWE** | CWE-943 |
| **受影响版本** | <= v0.10.8-alpha.9 |
| **修复版本** | v0.10.8-alpha.10 |
| **披露日期** | 2026-02-22 |
| **报告者** | xuemian168, callmeiks |

**漏洞描述**：Token 搜索端点未转义 LIKE 通配符。攻击者发送 `keyword=%` 触发全表扫描。在 200 万条记录上单次查询 6 秒，50 并发导致数据库 CPU 100% + 应用 OOM。

```python
# PoC
import requests
from concurrent.futures import ThreadPoolExecutor
def attack(session_cookie):
    requests.get('http://localhost:3000/api/token/search',
        params={'keyword': '%_%_%_%_%_%', 'token': ''},
        cookies={'session': session_cookie},
        headers={'New-API-User': '1'})
with ThreadPoolExecutor(max_workers=50) as executor:
    for _ in range(50):
        executor.submit(attack, '<valid_session>')
```

---

## EXT-7. 支付 Webhook 未认证 DoS

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-v828-m3pf-vq9q |
| **严重程度** | HIGH (CVSS 3.1: 7.5) |
| **CWE** | CWE-400, CWE-770 |
| **受影响版本** | < v1.0.0-rc.11 |
| **修复版本** | v1.0.0-rc.11 |
| **披露日期** | 2026-07-03 |
| **报告者** | passer12 |

**漏洞描述**：Stripe/Creem/Waffo webhook 端点在验证签名前读取并记录完整请求体。攻击者可发送超大请求导致 OOM 或日志磁盘耗尽。修复方案添加 `middleware.AnonymousRequestBodyLimit()` 限制 512 KiB。

---

## EXT-8. SSRF 保护绕过 — 302 重定向

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-9f46-w24h-69w4 |
| **CVE** | CVE-2025-62155 |
| **严重程度** | HIGH |
| **受影响版本** | <= v0.9.5 |
| **修复版本** | v0.9.6 |
| **披露日期** | 2025-11-23 |
| **报告者** | h3rrr |

---

## EXT-9. 已认证 SSRF

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-xxv6-m6fx-vfhh |
| **CVE** | CVE-2025-59146 |
| **严重程度** | HIGH |
| **受影响版本** | <= v0.9.0.4 |
| **修复版本** | v0.9.0.5 |
| **披露日期** | 2025-10-09 |
| **报告者** | t0ng7u |

---

## EXT-10. 邮箱/微信绑定 CSRF

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-26v7-h57m-gh9m |
| **CVE** | CVE-2026-44342 |
| **严重程度** | MEDIUM (CVSS 3.1: 5.3) |
| **受影响版本** | < v0.12.0-alpha.1 |
| **修复版本** | v0.12.0-alpha.1 |
| **报告者** | kyo-w |

---

## EXT-11. VideoProxy IDOR

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-f35r-v9x5-r8mc |
| **CVE** | CVE-2026-30886 |
| **严重程度** | MEDIUM (CVSS 3.1: 6.5) |
| **受影响版本** | <= v0.11.4-alpha.1 |
| **修复版本** | v0.11.4-alpha.2 |
| **报告者** | Mistz1 |

---

## EXT-12. Passkey 步进验证绕过

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-5353-f8fq-65vc |
| **CVE** | CVE-2026-32879 |
| **严重程度** | MEDIUM (CVSS 3.1: 4.9) |
| **受影响版本** | >= v0.10.0 |
| **修复版本** | **未指定** |
| **报告者** | asdf2adsfad |

---

## EXT-13. 管理员 Passkey 越权重置

| 字段 | 值 |
|------|---|
| **GHSA** | GHSA-p845-629j-rcj6 |
| **严重程度** | MEDIUM |
| **受影响版本** | v0.9.1.3 ~ < v1.0.0-rc.7 |
| **修复版本** | v0.1.0-rc.7 |
| **报告者** | 无 |

---

# 第二部分：本次代码审计发现（44个）

## P0 / 严重漏洞（8个）

---

### P0-1. CORS 允许所有来源 + 凭证发送

**文件**: `middleware/cors.go:9-16`
**严重程度**: P0 / HIGH

**漏洞代码**:
```go
func CORS() gin.HandlerFunc {
    config := cors.DefaultConfig()
    config.AllowAllOrigins = true    // 行11: 允许任何域名
    config.AllowCredentials = true   // 行12: 允许携带 Cookie
    config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
    config.AllowHeaders = []string{"*"}  // 行14: 允许任意请求头
    return cors.New(config)
}
```

**攻击场景**: 攻击者搭建 `evil.com` → 受害者（已登录）访问 → JS 自动向 NewAPI 发起 fetch（浏览器附带 session cookie）→ 攻击者读取用户信息、创建/删除 Token、转移配额、查看所有渠道密钥。

**影响**: 所有已登录用户均可被跨站攻击，等同完全接管任意账户。

**修复**:
```go
config.AllowOrigins = []string{"https://your-frontend-domain.com"}
config.AllowCredentials = true
config.AllowHeaders = []string{"Authorization", "Content-Type"}
```

---

### P0-2. 默认 Root 密码 `123456` 明文写入日志

**文件**: `model/main.go:57-78`
**严重程度**: P0 / HIGH

**漏洞代码**:
```go
func createRootAccountIfNeed() error {
    var user User
    if err := DB.First(&user).Error; err != nil {
        // 行61: 密码明文写入日志！
        common.SysLog("no user exists, create a root user for you: username is root, password is 123456")
        hashedPassword, err := common.Password2Hash("123456")  // 行62: 硬编码密码
        if err != nil {
            return err
        }
        rootUser := User{
            Username:    "root",
            Password:    hashedPassword,
            Role:        common.RoleRootUser,
            Quota:       100000000,  // 行73: 1亿额度
        }
        DB.Create(&rootUser)  // 行75: 返回值未检查
    }
    return nil
}
```

**影响**: 运维人员、日志聚合系统（ELK/Loki）、SIEM 均可读取日志中的密码。首次部署后若未修改密码，系统可被 trivially 接管。

**修复**: 通过 `/api/setup` 端点强制设置密码；永不记录密码；`DB.Create` 应检查错误。

---

### P0-3. 用户配额可被减为负数

**文件**: `model/user.go:1078-1101`
**严重程度**: P0 / HIGH

**漏洞代码**:
```go
func DecreaseUserQuota(id int, quota int, db bool) (err error) {
    if quota < 0 {
        return errors.New("quota 不能为负数！")  // 只检查传入值
    }
    gopool.Go(func() {
        err := cacheDecrUserQuota(id, int64(quota))  // 行1083: Redis 异步更新
        if err != nil {
            common.SysLog("failed to decrease user quota: " + err.Error())
        }
    })
    if !db && common.BatchUpdateEnabled {
        addNewRecord(BatchUpdateTypeUserQuota, id, -quota)
        return nil  // 行1090: 批量模式下不立即写库
    }
    return decreaseUserQuota(id, quota)
}

func decreaseUserQuota(id int, quota int) (err error) {
    // 行1096: 无 WHERE quota >= ? 守卫！
    err = DB.Model(&User{}).Where("id = ?", id).
        Update("quota", gorm.Expr("quota - ?", quota)).Error
    return err
}
```

**竞态攻击场景**:
1. 用户余额 = 100，同时发起 5 个 API 请求各扣 100
2. 所有请求从 Redis 读到余额 100 > 0，通过检查
3. 并发执行 SQL `quota - 100`，余额变为 -400
4. 用户获得 400 的"信用额度"

**修复**:
```go
func decreaseUserQuota(id int, quota int) (err error) {
    result := DB.Model(&User{}).
        Where("id = ? AND quota >= ?", id, quota).
        Update("quota", gorm.Expr("quota - ?", quota))
    if result.Error != nil {
        return result.Error
    }
    if result.RowsAffected == 0 {
        return errors.New("insufficient quota")
    }
    return nil
}
```

---

### P0-4. 批量更新无事务保护

**文件**: `model/utils.go:52-113`
**严重程度**: P0 / HIGH

**漏洞代码**:
```go
func batchUpdate() {
    // 行70-76: 在锁内交换 map 摘要
    stores := make([]map[int]int, BatchUpdateTypeCount)
    for i := 0; i < BatchUpdateTypeCount; i++ {
        batchUpdateLocks[i].Lock()
        stores[i] = batchUpdateStores[i]
        batchUpdateStores[i] = make(map[int]int)  // 替换为空 map
        batchUpdateLocks[i].Unlock()
    }
    // 行109-111: 在锁外逐条更新，无事务！
    for key := range userIDs {
        updateUserQuotaUsedQuotaAndRequestCount(key,
            userQuotaStore[key], usedQuotaStore[key], requestCountStore[key])
        // ↑ 每条独立 SQL，中途崩溃 = 部分提交部分丢失
    }
}
```

**影响**: 服务器崩溃/panic 导致部分用户额度已更新、部分未更新，且丢失的数据已从内存 store 中移除，永久不可恢复。

**修复**: 将每批次包裹在 `DB.Transaction()` 中；单条失败记录日志并重试。

---

### P0-5. Epay Webhook 未校验支付金额

**文件**: `controller/topup.go:310-412`
**严重程度**: P0 / HIGH

**漏洞代码**:
```go
func EpayNotify(c *gin.Context) {
    // 行353: 验签
    verifyInfo, err := client.Verify(params)
    if err == nil && verifyInfo.VerifyStatus {
        // 行374-376: 锁定订单
        LockOrder(verifyInfo.ServiceTradeNo)
        topUp := model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
        // ...
        // 行385-388: 支付方式不匹配时静默覆盖！
        if topUp.PaymentMethod != verifyInfo.Type {
            topUp.PaymentMethod = verifyInfo.Type  // 直接覆盖
        }
        topUp.Status = common.TopUpStatusSuccess
        // 行398-400: 用订单金额（非回调金额）计算额度
        dAmount := decimal.NewFromInt(int64(topUp.Amount))
        dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
        quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
        // ↑ 从未校验 verifyInfo.Money == topUp.Money
    }
}
```

**修复**:
```go
// 添加金额校验
callbackMoney := decimal.NewFromFloat(verifyInfo.Money)
orderMoney := decimal.NewFromInt(int64(topUp.Amount))
if !callbackMoney.Equal(orderMoney) {
    logger.LogError(c, fmt.Sprintf("payment amount mismatch: order=%v callback=%v", orderMoney, callbackMoney))
    c.String(http.StatusOK, "FAIL")
    return
}
```

---

### P0-6. API Key 明文存储

**文件**: `model/token.go:14-32`

**漏洞代码**:
```go
type Token struct {
    Id    int    `json:"id"`
    Key   string `json:"key" gorm:"type:varchar(128);uniqueIndex"`  // 行17: 明文存储！
    // ...
}
```

**查询时明文匹配**:
```go
func GetTokenByKey(key string, fillUser bool) (*Token, error) {
    err := DB.Where("`key` = ?", key).First(&token).Error  // 行: 明文查询
}
```

**影响**: 数据库泄露即所有 API Key 全部暴露。

**修复**: 创建时 `SHA256(key)` 存储；查询时 `WHERE key_hash = SHA256(input)`；仅创建时返回原始 Key。

---

### P0-7. Access Token 无过期机制

**文件**: `model/user.go:38, 933-947`

**漏洞代码**:
```go
// 行38: 32字符明文存储，无过期时间字段
AccessToken *string `json:"-" gorm:"type:char(32);column:access_token;uniqueIndex"`

// 行933-947: 验证无过期检查、无用户状态检查
func ValidateAccessToken(token string) (*User, error) {
    token = strings.Replace(token, "Bearer ", "", 1)
    user := &User{}
    err := DB.Where("access_token = ?", token).First(user).Error
    // ↑ 不检查 user.Status 是否为 enabled
    // ↑ 不检查是否过期（无字段）
    return user, nil
}
```

**问题**:
- Access Token 一旦创建永不过期
- 不检查用户是否被禁用——被禁用用户的 Token 仍可认证
- 无撤销机制

---

### P0-8. 日志大规模泄露敏感数据

**涉及文件及行号**:

| 泄露类型 | 位置 | 代码示例 |
|----------|------|---------|
| 兑换码原文 | `controller/user.go:1316` | `fmt.Sprintf("failed to redeem key %s ...", req.Key)` |
| Epay 完整验签信息 | `controller/topup.go:355` | `common.GetJsonString(verifyInfo)` |
| OAuth Token | `oauth/*.go` debug 日志 | token response body |
| Redis 缓存值 | `common/redis.go` debug 日志 | 完整 value |
| 异步任务内容 | `controller/task_video.go` | `logger.LogJson(..., task)` 含 provider key |
| 数据库错误 | `controller/setup.go:100` | `err.Error()` 返回客户端 |
| Panic 堆栈 | `main.go:176` | `fmt.Sprintf("Panic detected, error: %v", err)` |

---

## P1 / 高危漏洞（12个）

---

### P1-1. LinuxDO OAuth Host Header 注入

**文件**: `oauth/linuxdo.go:57-62`

```go
// 行57-62
scheme := "http"
if c.Request.TLS != nil {
    scheme = "https"
}
redirectURI := fmt.Sprintf("%s://%s/api/oauth/linuxdo", scheme, c.Request.Host)
// ↑ c.Request.Host 可被攻击者伪造！
```

对比安全实现（`oauth/oidc.go:59`）：使用固定的 `system_setting.ServerAddress`。

**修复**: 使用 `system_setting.ServerAddress` 替代 `c.Request.Host`。

---

### P1-2. Custom OAuth Discovery SSRF

**文件**: `controller/custom_oauth.go:142-211`

```go
// 行179: 裸 http.Client，无 SSRF 保护
client := &http.Client{Timeout: 20 * time.Second}
resp, err := client.Do(httpReq)  // 行180: 直接请求用户提供的 URL
// ↑ 无内网 IP 过滤
// ↑ resp.Body 无 LimitReader（错误路径有 512 限制，成功路径无限制）
```

**修复**: 使用 `GetSSRFProtectedHTTPClient()`；添加 `LimitReader`。

---

### P1-3. Relay 核心出站请求完全无 SSRF 保护

**文件**: `relay/channel/api_request.go:477-487`

```go
func doRequest(c *gin.Context, req *http.Request, info *common.RelayInfo) (*http.Response, error) {
    var client *http.Client
    if info.ChannelSetting.Proxy != "" {
        client, err = service.NewProxyHttpClient(info.ChannelSetting.Proxy)  // 行481: 无 SSRF dialer
    } else {
        client = service.GetHttpClient()  // 行486: 无 SSRF 保护！
    }
    // ↑ 所有 relay 出站请求（文本/图像/音频）均通过此函数
    // ↑ 完全绕过了 SSRF 保护基础设施
}
```

**影响**: 这是 relay 路径最核心的 SSRF 薄弱点——所有 LLM API 调用的出站请求均无 SSRF 保护。

---

### P1-4. Ali 图片处理裸 http.Client

**文件**: `relay/channel/ali/image.go:207-208`

```go
// 行207: 每次调用创建新实例
client := &http.Client{}
resp, err := client.Do(req)  // 行208
// ↑ 无 Timeout
// ↑ 无 TLS 配置
// ↑ 无 SSRF 保护
// ↑ 无连接池
```

---

### P1-5. PRNG 生成 OAuth State

**文件**: `common/str.go:41-46` + `controller/oauth.go:26`

```go
// common/str.go:45
func GetRandomString(length int) string {
    return lo.RandomString(length, lo.AlphanumericCharset)
    // ↑ lo.RandomString 内部使用 math/rand/v2（可预测！）
}

// controller/oauth.go:26
state := common.GetRandomString(12)  // 仅12字符 + 非加密 PRNG
session.Set("oauth_state", state)
```

**修复**: 使用 `crypto/rand`（项目已有 `GenerateRandomCharsKey`）；长度增加到 32+ 字符。

---

### P1-6. Pprof 无认证绑定 0.0.0.0

**文件**: `main.go:40, 157-163`

```go
// 行40: 全局导入
_ "net/http/pprof"

// 行157-163
if os.Getenv("ENABLE_PPROF") == "true" {
    gopool.Go(func() {
        log.Println(http.ListenAndServe("0.0.0.0:8005", nil))
        // ↑ 所有网卡暴露，无认证
    })
}
```

**修复**: 绑定 `127.0.0.1:8005`；添加 Basic Auth。

---

### P1-7. TryUserAuth 不验证用户状态

**文件**: `middleware/auth.go:170-179`

```go
func TryUserAuth() func(c *gin.Context) {
    return func(c *gin.Context) {
        session := sessions.Default(c)
        id := session.Get("id")
        if id != nil {
            c.Set("id", id)  // 直接设置，不验证用户是否存在/是否禁用
        }
        c.Next()
    }
}
```

---

### P1-8. TokenOrUserAuth 跳过角色验证

**文件**: `middleware/auth.go:221-235`

```go
func TokenOrUserAuth() func(c *gin.Context) {
    return func(c *gin.Context) {
        session := sessions.Default(c)
        if id := session.Get("id"); id != nil {
            if status, ok := session.Get("status").(int); ok && status == common.UserStatusEnabled {
                c.Set("id", id)
                // ↑ 只设置 id，不设置 role/group！
                c.Next()
                return
            }
        }
        TokenAuth()(c)  // Token 路径会设置完整的 id/role/group
    }
}
// 后续 handler 调用 c.GetInt("role") 得到零值 0
```

---

### P1-9. 新用户默认创建永不过期无限额 Token

**文件**: `controller/user.go:267-294`

```go
if constant.GenerateDefaultToken {
    token := model.Token{
        ExpiredTime:        -1,       // 行280: 永不过期
        UnlimitedQuota:     true,     // 行282: 无限额度
        ModelLimitsEnabled: false,    // 行283: 不限模型
        RemainQuota:        500000,   // 行281: 50万额度（硬编码）
    }
}
```

---

### P1-10. 管理员配额 Override 无校验

**文件**: `controller/user.go:1148-1153`

```go
case "override":
    oldQuota := user.Quota
    // 行1150: req.Value 可以是任意 int，包括负数和极大值
    if err := model.DB.Model(&model.User{}).Where("id = ?", user.Id).
        Update("quota", req.Value).Error; err != nil {
        // ↑ 无 >= 0 校验，无上限校验
    }
```

---

### P1-11. 前端 XSS — UnescapeHTML

**文件**: `common/utils.go:211-213`

```go
func UnescapeHTML(x string) interface{} {
    return template.HTML(x)  // 标记任意字符串为安全 HTML，绕过转义
}
```

---

### P1-12. 登录 Open Redirect

前端登录页 `/sign-in?redirect=...` 未限制为同源路径。攻击者构造 `redirect=//evil.com` 可在登录成功后跳转到钓鱼站点。

---

## P2 / 中危漏洞（16个）

| # | 漏洞 | 文件:行号 | 说明 |
|---|------|----------|------|
| P2-1 | 数据库错误泄露 | `controller/setup.go:100`, `channel.go` 多处 | `err.Error()` 返回客户端 |
| P2-2 | Panic 泄露堆栈 | `main.go:176` | panic 值含文件路径、行号 |
| P2-3 | Session Secret 重启生成 | `common/constants.go:75-76` | `uuid.New().String()` 每次不同 |
| P2-4 | Docker 以 root 运行 | `Dockerfile:41-52` | 无 `USER` 指令 |
| P2-5 | Docker 弱密码 | `docker-compose.yml:29,34,66,76` | 所有密码 `123456` |
| P2-6 | Session Cookie 不安全 | `common/constants.go:77` | `Secure=false` 默认 |
| P2-7 | TLS 全局跳过验证 | `common/init.go:89-98` | 修改 `http.DefaultTransport` |
| P2-8 | WebSocket Origin 禁用 | `controller/relay.go:253-254` | `CheckOrigin: func() bool { return true }` |
| P2-9 | OAuth State 未一次性使用 | `controller/oauth.go:58-66` | 验证后不删除 |
| P2-10 | 登录无账户级限流 | `controller/user.go:40-98` | 仅 IP 级，可分布式绕过 |
| P2-11 | 兑换码无限流 | `controller/user.go:1293-1324` | 无频率限制 |
| P2-12 | 临时密码返回响应 | `controller/misc.go:361-365` | `"data": password` |
| P2-13 | Session Fixation | `controller/user.go:138-163` | 登录前不清除 session |
| P2-14 | 重复退款风险 | Suno/视频异步任务 | 缺少 CAS 保护 |
| P2-15 | Stripe 丢单 | Stripe 创建流程 | 先创建 Session 再插订单 |
| P2-16 | 上游失败静默成功 | Suno/视频 polling | 返回 nil 误判为成功 |

---

## P3 / 低危漏洞（8个）

| # | 漏洞 | 文件:行号 | 说明 |
|---|------|----------|------|
| P3-1 | Session 30天过长 | `main.go:191` | `MaxAge: 2592000` |
| P3-2 | 登出不失效 API Token | `controller/user.go:166-181` | 仅清除 session |
| P3-3 | GetSelf 泄露 Stripe ID | `controller/user.go:505` | `"stripe_customer"` |
| P3-4 | RateLimiter 竞态 | `common/rate-limit.go:14-26` | 应使用 `sync.Once` |
| P3-5 | sync.Map 内存泄漏 | `controller/user.go:1252` | topUpLocks 无清理 |
| P3-6 | Docker 暴露端口 | `docker-compose.yml:24` | 建议用反向代理 |
| P3-7 | Dev Redis 无认证 | `docker-compose.dev.yml:31` | 无密码 |
| P3-8 | GitHub Actions 版本注入路径错误 | `.github/workflows/release.yml` | ldflags 包路径错误 |

---

# 第三部分：稳定性与性能问题（8个）

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| S1 | 请求体复用失败 | disk-backed body | 丢失 `io.ReadSeeker`，重试失败 |
| S2 | SSE `[DONE]` 识别不全 | SSE scanner | 不识别裸 `[DONE]`，流挂起 |
| S3 | SSE ping 阻塞 | ping loop | 客户端断开后 goroutine 泄漏 |
| S4 | Relay task fetch panic | `relay/relay_task.go` | 非法 mode 后调用 nil |
| S5 | 出站 HTTP 无超时 | 多处 `http.Client{}` | `RELAY_TIMEOUT=0` 时无限等待 |
| S6 | 任务轮询无大小限制 | `io.ReadAll` 多处 | 上游异常大 body → OOM |
| S7 | 连接池默认过大 | SQL/Redis | 低配服务器内存耗尽 |
| S8 | Nova 空响应越界 | AWS Nova parsing | content 为空时 panic |

---

# 第四部分：修复路线图与检查清单

## 第一阶段：立即修复（1-3天）

| 编号 | 问题 | 工作量 |
|------|------|--------|
| P0-1 | CORS 白名单 | 30分钟 |
| P0-2 | 默认 root 密码日志 | 30分钟 |
| P0-3 | 配额 SQL 守卫 | 1小时 |
| P0-5 | Epay 金额校验 | 1小时 |
| P1-1 | LinuxDO Host 注入 | 15分钟 |
| P1-5 | PRNG 替换为 crypto/rand | 2小时 |
| P1-6 | pprof 绑定 localhost | 15分钟 |
| P1-11 | 删除 UnescapeHTML | 5分钟 |

## 第二阶段：一周内修复

| 编号 | 问题 | 工作量 |
|------|------|--------|
| P0-4 | 批量更新事务化 | 1天 |
| P0-6 | API Key 哈希存储 | 2天 |
| P0-7 | Access Token 过期 | 1天 |
| P0-8 | 日志脱敏 | 2天 |
| P1-3 | Relay SSRF 保护统一 | 1天 |
| P1-8 | TokenOrUserAuth 修复 | 2小时 |
| P1-10 | 配额 override 校验 | 30分钟 |
| P1-12 | Open Redirect 修复 | 1天 |

## 第三阶段：上线前完成

- P2 所有中危漏洞
- P3 所有低危问题
- S1-S8 稳定性问题
- Docker 安全加固

## 上线前检查清单

- [ ] `CORS_ALLOW_ORIGINS` 配置真实前端域名
- [ ] `SESSION_SECRET` 和 `CRYPTO_SECRET` 为不同高熵随机值
- [ ] `SESSION_COOKIE_SECURE=true` + `SESSION_COOKIE_TRUSTED_URL` 已配置
- [ ] `DEBUG=false`
- [ ] `TLS_INSECURE_SKIP_VERIFY` 未开启
- [ ] pprof 未公开暴露
- [ ] root 账户已修改密码
- [ ] 所有支付 webhook 已测试金额校验
- [ ] `go test ./...` 全部通过
- [ ] 前端 build 在干净环境通过
- [ ] 登录、OAuth、绑定、支付、异步任务、流式 relay 全流程测试
- [ ] 日志目录权限收紧（0750）

---

## 项目正面评价

| 措施 | 位置 | 评价 |
|------|------|------|
| bcrypt 密码哈希 | `common/crypto.go:23-26` | 使用 DefaultCost，符合标准 |
| GORM 参数化查询 | 全局 | 绝大多数使用 `?` 占位符 |
| LIKE 查询清洗 | `model/token.go` | `sanitizeLikePattern()` 正确转义 |
| SSRF 保护基础设施 | `common/ssrf_protection.go` | 实现完整（但应用不一致） |
| 前端 DOMPurify | `html-content.tsx:124-135` | 正确配置 FORBID_TAGS |
| RBAC 层级控制 | `controller/user.go:346-348` | `canManageTargetRole()` 防越权 |
| TOTP 2FA | `common/totp.go` | 有失败锁定 |
| AnonymousBodyLimit | `middleware/request_body_limit.go` | 支付 webhook 限制 512KiB |

---

*报告结束。审计日期：2026-07-09。共发现 57 个安全问题（44 新发现 + 13 已知 CVE）。*
