# Kimi Code CLI 配置说明

Kimi Code CLI 目前不直接在用户配置文件中定义 MCP Server，而是通过以下方式集成：

## 方案一：Kimi WebBridge（外部 MCP 管理）

Kimi 的 MCP 集成通常通过 Kimi WebBridge 或 IDE 插件市场管理。

## 方案二：手动配置 .mcp.json

Kimi Code CLI 在部分版本中支持读取 `.mcp.json`（与 Claude Code 相同格式）：

**路径**: `~/.mcp.json`

```json
{
  "mcpServers": {
    "arc-tunnel": {
      "command": "node",
      "args": ["<仓库路径>/mcp-server/dist/mcp-server.js"],
      "env": {
        "WS_PORT": "8765"
      }
    }
  }
}
```

## 方案三：通过 Kimi CLI 的 skills 系统

参考 Kimi CLI 的 skill 机制，创建自定义 skill 调用 Arc Tunnel 的底层 API。

> 建议关注 Kimi 官方文档获取最新的 MCP 集成方式：https://www.kimi.com
