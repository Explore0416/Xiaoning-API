@echo off
chcp 65001 >nul 2>&1
title New-API

echo ============================================
echo    New-API 启动中...
echo ============================================
echo.

:: 检查数据库配置
if "%SQL_DSN%"=="" (
    echo [INFO] 未设置 SQL_DSN，将使用 SQLite 数据库
    echo [INFO] 数据文件：data.db
    echo.
)

if not "%REDIS_CONN_STRING%"=="" (
    echo [INFO] Redis 已配置
) else (
    echo [INFO] 未配置 Redis，缓存功能将禁用
    echo.
)

echo 启动参数: %*
echo ============================================
echo.

new-api.exe %*

pause
