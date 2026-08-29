# New-API 部署包

## 文件说明

| 文件 | 说明 |
|------|------|
| `new-api.exe` | 主程序（已修复安全漏洞） |
| `docker-compose.yml` | Docker 部署配置 |
| `start.bat` | Windows 一键启动脚本 |
| `LICENSE` / `NOTICE` | 许可证文件 |

## 快速启动

### 方式一：直接运行（SQLite，最简单）

```
new-api.exe
```

首次运行会自动创建数据库 `data.db`，访问 http://localhost:3000

### 方式二：Docker Compose（PostgreSQL，推荐生产）

1. 修改 `docker-compose.yml` 中的密码（搜索 `CHANGE_ME` 全部替换）
2. 执行：

```bash
docker-compose up -d
```

3. 访问 http://localhost:3000

### 方式三：自定义部署

```bash
# 设置环境变量后启动
set SQL_DSN=postgresql://user:密码@localhost:5432/new-api
set REDIS_CONN_STRING=redis://:密码@localhost:6379
new-api.exe
```

## 本次安全修复内容

- P0-1 ~ P0-6：致命漏洞全部修复
- P1-7、P1-10：高危漏洞修复
- Session Cookie 安全默认值修正
- Epay 回调金额验证
- 管理员配额覆盖缓存一致性

## 多机部署

必须设置 `SESSION_SECRET` 环境变量：

```bash
set SESSION_SECRET=一个随机字符串（所有节点必须相同）
```

## HTTPS 部署

在 nginx 反代后设置：

```bash
set SESSION_COOKIE_SECURE=true
set SESSION_COOKIE_TRUSTED_URL=https://your-domain.com
```
