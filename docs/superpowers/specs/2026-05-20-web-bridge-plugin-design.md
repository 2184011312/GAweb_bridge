# Web Bridge Plugin 设计文档

**日期**: 2026-05-20  
**版本**: 1.0  
**作者**: AI Assistant

## 1. 项目概述

### 1.1 项目目标

开发一个浏览器自动化插件系统，通过 MCP (Model Context Protocol) 协议让 AI 助手能够控制用户手动打开的浏览器，实现智能化的网页操作、数据提取、表单填充等功能。

### 1.2 核心特性

- **浏览器控制**: 通过浏览器扩展的 `chrome.debugger` API 控制现有浏览器标签页
- **MCP 集成**: 作为 MCP 服务器，与 Claude Code 等 AI 工具无缝集成
- **智能录制回放**: 记录用户操作并智能回放，支持页面结构变化后的自适应
- **会话管理**: 保存和恢复浏览器会话，保持登录态
- **多标签页管理**: 同时控制多个标签页，支持并发操作

### 1.3 技术栈

- **MCP 服务器**: Node.js + TypeScript + @modelcontextprotocol/sdk + ws
- **浏览器扩展**: TypeScript + Chrome Extension Manifest V3
- **构建工具**: esbuild/webpack
- **通信协议**: WebSocket (双向实时通信)

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude Code (AI)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP Protocol (stdio)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                    MCP 服务器进程                                │
│  - MCP 协议处理 (stdio transport)                               │
│  - WebSocket 服务器 (ws://localhost:8765)                       │
│  - 命令队列管理                                                  │
│  - 结果缓存                                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ WebSocket
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              浏览器扩展 (Chrome/Edge Extension)                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Background Service Worker (核心)                  │  │
│  │  - WebSocket 客户端                                       │  │
│  │  - 标签页管理器 (TabManager)                              │  │
│  │  - CDP 命令执行器 (DebuggerController)                    │  │
│  │  - 录制引擎 (RecordingEngine)                             │  │
│  │  - 回放引擎 (PlaybackEngine)                              │  │
│  │  - 会话管理 (SessionManager)                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                             │                                    │
│                    chrome.debugger API                           │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │              标签页 1, 2, 3... (被控制)                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 架构设计原则

**扩展主导架构 (Extension-First Architecture)**

**Why:** 浏览器扩展拥有完整的浏览器 API 访问权限，`chrome.debugger` API 只能在扩展中使用，因此将核心业务逻辑放在扩展中是最自然的选择。

**优点:**
- 扩展有完整的浏览器 API 访问权限
- 多标签页管理更自然
- 会话保持由扩展负责，更可靠
- 可以监听浏览器事件，实现智能录制

**How to apply:** MCP 服务器作为轻量级协议适配器，只负责 MCP 协议转换和 WebSocket 通信，所有浏览器操作逻辑都在扩展中实现。

### 2.3 组件职责划分

#### MCP 服务器进程
- 接收 Claude Code 的 MCP 工具调用
- 管理 WebSocket 连接（监听端口、处理连接/断开）
- 转发命令到浏览器扩展
- 缓存执行结果并返回给 AI

#### 浏览器扩展
- 管理所有标签页的生命周期
- 执行 CDP 命令（通过 chrome.debugger API）
- 实现智能录制和回放
- 管理会话数据（Cookie、LocalStorage）
- 提供用户控制面板（Popup UI）

## 3. MCP 服务器设计

### 3.1 MCP 工具列表

```typescript
// 基础导航和操作
- navigate(tabId, url)              // 导航到 URL
- click(tabId, selector)            // 点击元素
- type(tabId, selector, text)       // 输入文本
- screenshot(tabId, options)        // 截图
- get_content(tabId, mode)          // 获取页面内容
- execute_script(tabId, script)     // 执行 JavaScript
- wait_for_element(tabId, selector) // 等待元素出现

// Cookie 和存储管理
- get_cookies(tabId, domain)        // 获取 Cookie
- set_cookies(tabId, cookies)       // 设置 Cookie
- clear_cookies(tabId, domain)      // 清除 Cookie

// 网络和下载
- intercept_network(tabId, pattern) // 拦截网络请求
- download_file(tabId, url)         // 下载文件

// 标签页管理
- create_tab(url)                   // 创建新标签页
- close_tab(tabId)                  // 关闭标签页
- switch_tab(tabId)                 // 切换标签页
- list_tabs()                       // 列出所有标签页

// 录制回放
- start_recording(tabId)            // 开始录制
- stop_recording(tabId)             // 停止录制
- replay_recording(recordingId)     // 回放录制

// 会话管理
- save_session(name)                // 保存会话
- restore_session(sessionId)        // 恢复会话
```

### 3.2 get_content 工具详细设计

`get_content` 工具支持多种模式，满足不同的信息提取需求：

#### 模式 A: HTML 模式
```typescript
get_content({ tabId: 123, mode: "html" })
// 返回：完整的 HTML 源码
```

#### 模式 B: 文本模式
```typescript
get_content({ tabId: 123, mode: "text" })
// 返回：纯文本内容（去除所有 HTML 标签）
```

#### 模式 C: 结构化模式（推荐）
```typescript
get_content({ tabId: 123, mode: "structured" })
// 返回：
{
  title: "页面标题",
  url: "https://example.com",
  text: "可见文本内容",
  links: [{text: "链接文字", href: "https://..."}],
  forms: [{id: "form1", fields: [...]}],
  images: [{src: "...", alt: "..."}],
  interactive: [{type: "button", text: "...", selector: "..."}]
}
```

#### 模式 D: Markdown 模式
```typescript
get_content({ tabId: 123, mode: "markdown" })
// 返回：转换为 Markdown 格式的页面内容
```

**Why:** 不同的 AI 任务需要不同格式的页面信息。结构化模式最适合 AI 理解和操作，Markdown 模式适合内容提取，HTML 模式适合调试。

**How to apply:** 在扩展中实现多种内容提取器，根据 mode 参数选择对应的提取策略。

### 3.3 服务器实现结构

```typescript
// src/mcp-server/index.ts
class WebBridgeMCPServer {
  private mcpServer: Server;
  private wsServer: WebSocket.Server;
  private extensionConnection: WebSocket | null;
  private commandQueue: Map<string, PendingCommand>;
  
  async start() {
    // 1. 启动 WebSocket 服务器
    this.wsServer = new WebSocket.Server({ port: 8765 });
    this.wsServer.on('connection', this.handleExtensionConnection);
    
    // 2. 初始化 MCP 服务器
    this.mcpServer = new Server({
      name: "web-bridge",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // 3. 注册 MCP 工具
    this.registerTools();
    
    // 4. 启动 stdio transport
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }
  
  private registerTools() {
    this.mcpServer.setRequestHandler(CallToolRequestSchema, 
      async (request) => this.handleToolCall(request)
    );
  }
  
  private async handleToolCall(request: CallToolRequest) {
    // 生成唯一 ID
    const commandId = generateUUID();
    
    // 发送命令到扩展
    this.sendToExtension({
      id: commandId,
      type: "command",
      command: request.params.name,
      params: request.params.arguments
    });
    
    // 等待扩展响应
    return await this.waitForResponse(commandId);
  }
}
```

## 4. 浏览器扩展设计

### 4.1 目录结构

```
extension/
├── manifest.json              # Manifest V3 配置
├── background/
│   ├── service-worker.ts      # 入口
│   ├── websocket-client.ts    # WebSocket 连接管理
│   ├── tab-manager.ts         # 标签页管理
│   ├── debugger-controller.ts # CDP 命令执行
│   ├── recording-engine.ts    # 录制引擎
│   ├── playback-engine.ts     # 回放引擎
│   └── session-manager.ts     # 会话管理
├── content/
│   ├── content-script.ts      # 页面注入脚本
│   └── element-selector.ts    # 智能元素定位
├── popup/
│   ├── popup.html             # 扩展弹窗 UI
│   └── popup.ts               # 控制面板
└── types/
    └── index.ts               # TypeScript 类型定义
```

### 4.2 核心模块设计

#### TabManager（标签页管理器）

**职责:**
- 跟踪所有打开的标签页
- 管理标签页的 debugger 附加状态
- 处理标签页创建/关闭/切换事件

```typescript
class TabManager {
  private tabs: Map<number, TabInfo>;
  private activeTabId: number | null;
  
  async attachDebugger(tabId: number): Promise<void>
  async detachDebugger(tabId: number): Promise<void>
  async createTab(url: string): Promise<number>
  async closeTab(tabId: number): Promise<void>
  async switchTab(tabId: number): Promise<void>
  listTabs(): TabInfo[]
}
```

#### DebuggerController（CDP 控制器）

**职责:**
- 附加/分离 debugger 到标签页
- 执行 CDP 命令
- 处理 CDP 事件监听

```typescript
class DebuggerController {
  async sendCommand(tabId: number, method: string, params?: any): Promise<any>
  async navigate(tabId: number, url: string): Promise<void>
  async click(tabId: number, selector: string): Promise<void>
  async type(tabId: number, selector: string, text: string): Promise<void>
  async screenshot(tabId: number, options?: ScreenshotOptions): Promise<string>
  async executeScript(tabId: number, script: string): Promise<any>
}
```

**Why:** CDP 提供了强大的底层浏览器控制能力，但 API 较为底层，需要封装成易用的高级接口。

**How to apply:** 使用 `chrome.debugger.sendCommand()` 发送 CDP 命令，将常用操作封装成语义化的方法。

#### RecordingEngine（录制引擎）

**职责:**
- 监听用户操作（点击、输入、导航）
- 记录操作序列和时间戳
- 生成可回放的脚本

```typescript
class RecordingEngine {
  private isRecording: boolean;
  private currentRecording: Recording | null;
  
  async startRecording(tabId: number): Promise<string>
  async stopRecording(): Promise<Recording>
  private recordAction(action: Action): void
  private attachEventListeners(tabId: number): void
}

interface Recording {
  id: string;
  name: string;
  createdAt: string;
  actions: Action[];
  metadata: {
    startUrl: string;
    duration: number;
  };
}
```

#### PlaybackEngine（回放引擎）

**职责:**
- 解析录制脚本
- 按序执行操作
- 处理等待和错误重试

```typescript
class PlaybackEngine {
  async replay(recording: Recording, options?: PlaybackOptions): Promise<PlaybackResult>
  private async executeAction(action: Action): Promise<void>
  private async smartWait(action: Action): Promise<void>
  private async executeWithRetry(action: Action, maxRetries: number): Promise<void>
}

interface PlaybackOptions {
  speed: number;        // 回放速度倍率
  pauseOnError: boolean;
  maxRetries: number;
}

interface PlaybackResult {
  success: boolean;
  executedActions: number;
  failedActions: Action[];
  duration: number;
}
```

#### SessionManager（会话管理）

**职责:**
- 保存/恢复标签页状态
- 管理 Cookie 和 LocalStorage
- 处理登录态保持

```typescript
class SessionManager {
  async saveSession(name: string): Promise<string>
  async restoreSession(sessionId: string): Promise<void>
  async exportSession(sessionId: string): Promise<SessionData>
  async importSession(data: SessionData): Promise<string>
}

interface SessionData {
  id: string;
  name: string;
  tabs: TabState[];
  savedAt: string;
}

interface TabState {
  url: string;
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}
```

## 5. 智能特性设计

### 5.1 智能元素定位策略

**问题:** 页面结构变化后，固定的 selector 会失效

**解决方案:** 多重定位策略 + 自动降级

#### 录制时生成多个定位器

```typescript
interface ElementTarget {
  primary: string;              // 优先级1：测试ID
  fallbacks: string[];          // 备用定位器
  visual?: {
    screenshot: string;         // 元素截图（base64）
    boundingBox: BoundingBox;   // 位置信息
  };
  context: {
    nearbyText: string;         // 附近的文本
    parentTag: string;          // 父元素标签
    role: string;               // ARIA role
  };
}

// 示例
{
  "type": "click",
  "target": {
    "primary": "data-testid=submit-button",
    "fallbacks": [
      "id=submit",
      "button:has-text('提交')",
      "button.btn-primary:nth-of-type(1)",
      "xpath=//button[@class='btn-primary'][1]"
    ],
    "visual": {
      "screenshot": "base64...",
      "boundingBox": {x: 100, y: 200, w: 80, h: 40}
    },
    "context": {
      "nearbyText": "请确认信息",
      "parentTag": "form",
      "role": "button"
    }
  }
}
```

#### 回放时的智能匹配

```typescript
async function findElement(target: ElementTarget): Promise<Element | null> {
  // 1. 尝试 primary selector
  let element = await trySelector(target.primary);
  if (element) return element;
  
  // 2. 尝试 fallback selectors
  for (const fallback of target.fallbacks) {
    element = await trySelector(fallback);
    if (element) return element;
  }
  
  // 3. 使用上下文信息智能搜索
  element = await findByContext(target.context);
  if (element) return element;
  
  // 4. 视觉匹配（最后手段）
  if (target.visual) {
    element = await findByVisual(target.visual);
  }
  
  return element;
}
```

**Why:** 页面结构经常变化（重构、A/B 测试、动态内容），单一定位器容易失效。多重策略提高回放成功率。

**How to apply:** 录制时收集多种定位信息，回放时按优先级尝试，直到找到元素或全部失败。

### 5.2 智能等待策略

**问题:** 页面加载、动画、异步请求导致元素未就绪

**解决方案:** 自动检测和智能等待

```typescript
interface WaitConditions {
  networkIdle: boolean;      // 等待网络空闲
  domStable: boolean;        // 等待 DOM 稳定
  elementVisible: boolean;   // 等待元素可见
  elementEnabled: boolean;   // 等待元素可交互
  customCondition?: string;  // 自定义等待条件（JS 表达式）
}

async function smartWait(action: Action): Promise<void> {
  const conditions = action.waitConditions;
  
  await Promise.all([
    conditions.networkIdle && waitForNetworkIdle(),
    conditions.domStable && waitForDOMStable(),
    conditions.elementVisible && waitForElementVisible(action.target),
    conditions.elementEnabled && waitForElementEnabled(action.target),
    conditions.customCondition && waitForCustom(conditions.customCondition)
  ]);
}
```

**网络空闲检测实现:**

```typescript
async function waitForNetworkIdle(timeout = 2000): Promise<void> {
  let lastRequestTime = Date.now();
  
  // 监听网络请求
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (method === "Network.requestWillBeSent") {
      lastRequestTime = Date.now();
    }
  });
  
  // 等待 2 秒内没有新请求
  while (Date.now() - lastRequestTime < timeout) {
    await sleep(100);
  }
}
```

**Why:** 现代网页大量使用异步加载，直接操作可能失败。智能等待确保页面就绪后再执行操作。

**How to apply:** 录制时记录页面状态变化，回放时根据条件自动等待。

### 5.3 智能表单填充

**问题:** 表单字段识别和自动填充

**解决方案:** 语义化字段识别

```typescript
interface FormField {
  name: string;
  type: string;
  label: string;
  selector: string;
  value: string;
  semanticType: string;  // email, password, phone, name, etc.
}

function detectFieldType(input: HTMLInputElement): string {
  // 1. 检查 type 属性
  if (input.type === "email") return "email";
  if (input.type === "password") return "password";
  
  // 2. 检查 name/id/autocomplete 属性
  const attrs = [input.name, input.id, input.autocomplete].join(" ").toLowerCase();
  if (attrs.includes("email") || attrs.includes("mail")) return "email";
  if (attrs.includes("pass") || attrs.includes("pwd")) return "password";
  if (attrs.includes("phone") || attrs.includes("tel")) return "phone";
  
  // 3. 检查 label 文本
  const label = findLabelForInput(input);
  if (label?.textContent.includes("邮箱")) return "email";
  if (label?.textContent.includes("密码")) return "password";
  
  return "text";
}
```

**Why:** 表单是网页交互的核心，智能识别字段类型可以让 AI 更好地理解和填充表单。

**How to apply:** 在 content script 中分析表单结构，提取字段的语义信息，供 AI 使用。

### 5.4 智能错误恢复

**问题:** 回放时遇到错误如何处理

**解决方案:** 自动重试 + 降级策略

```typescript
async function executeActionWithRetry(
  action: Action, 
  maxRetries = 3
): Promise<ExecutionResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await executeAction(action);
      return { success: true };
      
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error);
      
      // 智能诊断
      const diagnosis = await diagnoseError(error, action);
      
      if (diagnosis.type === "element_not_found") {
        // 尝试使用备用定位器
        action.target.primary = action.target.fallbacks.shift();
        
      } else if (diagnosis.type === "element_not_interactable") {
        // 等待更长时间
        await sleep(2000);
        await scrollIntoView(action.target);
        
      } else if (diagnosis.type === "network_error") {
        // 等待网络恢复
        await waitForNetworkIdle();
        
      } else {
        // 无法恢复的错误
        if (attempt === maxRetries) {
          return { 
            success: false, 
            error: error.message,
            diagnosis 
          };
        }
      }
    }
  }
}
```

**Why:** 网页环境复杂多变，单次执行可能因各种原因失败。智能重试提高成功率。

**How to apply:** 根据错误类型选择不同的恢复策略，而不是简单重试。

## 6. 通信协议设计

### 6.1 WebSocket 消息格式

#### 请求消息（MCP 服务器 → 扩展）

```typescript
interface CommandMessage {
  id: string;              // 请求 ID（UUID）
  type: "command";         // 消息类型
  command: string;         // 命令名称（如 "navigate", "click"）
  params: any;             // 命令参数
  timeout?: number;        // 超时时间（毫秒）
}

// 示例
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "command",
  "command": "navigate",
  "params": {
    "tabId": 123,
    "url": "https://example.com"
  },
  "timeout": 30000
}
```

#### 响应消息（扩展 → MCP 服务器）

```typescript
interface ResponseMessage {
  id: string;              // 对应的请求 ID
  type: "response";
  success: boolean;
  result?: any;            // 执行结果
  error?: ErrorInfo;       // 错误信息
}

// 成功响应示例
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "success": true,
  "result": {
    "status": "loaded",
    "finalUrl": "https://example.com"
  }
}

// 错误响应示例
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "response",
  "success": false,
  "error": {
    "code": "ELEMENT_NOT_FOUND",
    "message": "无法找到元素",
    "details": {
      "selector": "#submit-button",
      "triedFallbacks": ["id=submit", "button:has-text('提交')"]
    }
  }
}
```

#### 事件消息（扩展 → MCP 服务器，主动推送）

```typescript
interface EventMessage {
  type: "event";
  event: string;           // 事件名称
  data: any;               // 事件数据
  timestamp: number;       // 时间戳
}

// 示例：标签页创建事件
{
  "type": "event",
  "event": "tab_created",
  "data": {
    "tabId": 456,
    "url": "https://example.com"
  },
  "timestamp": 1716192000000
}

// 示例：录制完成事件
{
  "type": "event",
  "event": "recording_completed",
  "data": {
    "recordingId": "rec-123",
    "actionCount": 15,
    "duration": 45000
  },
  "timestamp": 1716192000000
}
```

### 6.2 错误码定义

```typescript
enum ErrorCode {
  // 连接错误
  CONNECTION_LOST = "CONNECTION_LOST",
  WEBSOCKET_ERROR = "WEBSOCKET_ERROR",
  
  // 标签页错误
  TAB_NOT_FOUND = "TAB_NOT_FOUND",
  TAB_CLOSED = "TAB_CLOSED",
  DEBUGGER_ATTACH_FAILED = "DEBUGGER_ATTACH_FAILED",
  
  // 元素错误
  ELEMENT_NOT_FOUND = "ELEMENT_NOT_FOUND",
  ELEMENT_NOT_VISIBLE = "ELEMENT_NOT_VISIBLE",
  ELEMENT_NOT_INTERACTABLE = "ELEMENT_NOT_INTERACTABLE",
  
  // 执行错误
  TIMEOUT = "TIMEOUT",
  SCRIPT_ERROR = "SCRIPT_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  
  // 录制回放错误
  RECORDING_NOT_FOUND = "RECORDING_NOT_FOUND",
  PLAYBACK_FAILED = "PLAYBACK_FAILED",
  
  // 会话错误
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  SESSION_RESTORE_FAILED = "SESSION_RESTORE_FAILED"
}
```

## 7. 数据存储设计

### 7.1 扩展端存储（chrome.storage.local）

```typescript
// 录制脚本存储
interface RecordingsStorage {
  recordings: {
    [recordingId: string]: Recording;
  };
}

// 示例
{
  "recordings": {
    "rec-001": {
      "id": "rec-001",
      "name": "登录流程",
      "createdAt": "2026-05-20T10:00:00Z",
      "actions": [
        {
          "type": "navigate",
          "url": "https://example.com/login",
          "timestamp": 0
        },
        {
          "type": "type",
          "target": {...},
          "text": "user@example.com",
          "timestamp": 1500
        },
        {
          "type": "click",
          "target": {...},
          "timestamp": 3000
        }
      ],
      "metadata": {
        "startUrl": "https://example.com/login",
        "duration": 15000,
        "actionCount": 10
      }
    }
  }
}
```

```typescript
// 会话数据存储
interface SessionsStorage {
  sessions: {
    [sessionId: string]: SessionData;
  };
}

// 示例
{
  "sessions": {
    "sess-001": {
      "id": "sess-001",
      "name": "已登录状态",
      "tabs": [
        {
          "url": "https://example.com/dashboard",
          "cookies": [
            {
              "name": "session_token",
              "value": "abc123...",
              "domain": ".example.com",
              "path": "/",
              "secure": true,
              "httpOnly": true
            }
          ],
          "localStorage": {
            "user_id": "12345",
            "theme": "dark"
          },
          "sessionStorage": {}
        }
      ],
      "savedAt": "2026-05-20T10:00:00Z"
    }
  }
}

// 配置存储
interface ConfigStorage {
  config: {
    wsUrl: string;
    autoReconnect: boolean;
    defaultTimeout: number;
    recordingOptions: {
      captureVisual: boolean;
      captureContext: boolean;
    };
  };
}

// 示例
{
  "config": {
    "wsUrl": "ws://localhost:8765",
    "autoReconnect": true,
    "defaultTimeout": 30000,
    "recordingOptions": {
      "captureVisual": true,
      "captureContext": true
    }
  }
}
```

### 7.2 存储限制和优化

**Chrome Storage 限制:**
- `chrome.storage.local`: 最大 10MB（可通过 `unlimitedStorage` 权限扩展）
- `chrome.storage.sync`: 最大 100KB（不适合大量数据）

**优化策略:**
1. **录制脚本压缩**: 使用 LZ-string 压缩 JSON 数据
2. **视觉数据可选**: 元素截图默认不保存，可配置开启
3. **定期清理**: 自动删除超过 30 天的录制脚本
4. **分页加载**: Popup UI 分页显示录制列表

## 8. 部署和配置

### 8.1 MCP 服务器部署

**打包方式:**
```bash
# 使用 esbuild 打包成单文件
npm run build

# 输出
dist/
├── mcp-server.js       # 打包后的服务器
└── package.json        # 依赖信息
```

**Claude Code 配置:**
```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "web-bridge": {
      "command": "node",
      "args": ["C:/path/to/web-bridge/dist/mcp-server.js"],
      "env": {
        "WS_PORT": "8765"
      }
    }
  }
}
```

### 8.2 浏览器扩展部署

**开发模式安装:**
1. 打开 Chrome/Edge 扩展管理页面（`chrome://extensions/`）
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension/dist` 目录

**生产模式发布:**
1. 打包扩展：`npm run build:extension`
2. 生成 `.zip` 文件
3. 提交到 Chrome Web Store / Edge Add-ons

**manifest.json 配置:**
```json
{
  "manifest_version": 3,
  "name": "Web Bridge",
  "version": "1.0.0",
  "description": "AI-powered browser automation",
  "permissions": [
    "debugger",
    "tabs",
    "storage",
    "cookies",
    "webNavigation",
    "unlimitedStorage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content-script.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

## 9. 安全性考虑

### 9.1 权限控制

**最小权限原则:**
- 只请求必要的浏览器权限
- 用户可以在 Popup UI 中控制哪些标签页可以被控制
- 敏感操作（如删除 Cookie）需要用户确认

### 9.2 数据安全

**敏感数据处理:**
- 密码字段的值不记录到录制脚本中（标记为 `***encrypted***`）
- Cookie 和 LocalStorage 数据加密存储
- 会话数据导出时提示用户包含敏感信息

**WebSocket 安全:**
- 默认只监听 localhost，不暴露到外网
- 可选：支持 WSS（加密 WebSocket）
- 可选：添加认证 token

### 9.3 代码注入防护

**Content Script 隔离:**
- Content Script 运行在隔离的 JavaScript 环境中
- 不直接访问页面的 JavaScript 对象
- 通过 `window.postMessage` 与页面通信

## 10. 测试策略

### 10.1 单元测试

**MCP 服务器测试:**
- 测试 MCP 工具注册和调用
- 测试 WebSocket 连接管理
- 测试命令队列和超时处理

**扩展模块测试:**
- TabManager 测试
- DebuggerController 测试
- RecordingEngine 和 PlaybackEngine 测试

### 10.2 集成测试

**端到端测试场景:**
1. MCP 服务器启动 → 扩展连接 → 执行命令 → 返回结果
2. 录制用户操作 → 保存脚本 → 回放验证
3. 保存会话 → 恢复会话 → 验证状态

**测试工具:**
- Jest（单元测试）
- Puppeteer（扩展 E2E 测试）
- Mock WebSocket 服务器

### 10.3 手动测试清单

- [ ] MCP 服务器能正常启动并监听 WebSocket
- [ ] 扩展能连接到 MCP 服务器
- [ ] 基础操作：导航、点击、输入、截图
- [ ] 多标签页管理：创建、切换、关闭
- [ ] 录制回放：录制操作、保存、回放成功
- [ ] 智能特性：元素定位降级、等待策略、错误重试
- [ ] 会话管理：保存会话、恢复会话、验证登录态
- [ ] 错误处理：网络断开、标签页关闭、超时

## 11. 性能优化

### 11.1 WebSocket 连接优化

- 使用心跳机制保持连接活跃
- 断线自动重连（指数退避）
- 消息批量发送（减少网络开销）

### 11.2 扩展性能优化

- Service Worker 保持活跃（定期发送消息）
- 懒加载录制脚本（按需读取）
- 截图压缩（降低存储和传输开销）
- DOM 查询缓存（减少重复查询）

## 12. 未来扩展

### 12.1 短期计划（v1.1 - v1.3）

- **多浏览器支持**: Firefox、Safari 扩展版本
- **录制增强**: 支持鼠标悬停、拖拽操作
- **AI 辅助**: 使用 AI 生成元素定位器
- **性能监控**: 记录页面加载时间、操作耗时

### 12.2 中期计划（v2.0）

- **可视化编辑器**: 图形化编辑录制脚本
- **条件分支**: 支持 if/else 逻辑
- **循环操作**: 支持 for/while 循环
- **变量系统**: 支持变量定义和引用
- **断言验证**: 自动验证页面状态

### 12.3 长期愿景

- **云端同步**: 录制脚本和会话云端存储
- **团队协作**: 共享录制脚本和会话
- **市场平台**: 录制脚本市场（如"登录淘宝"、"填写表单"）
- **跨设备支持**: 移动端浏览器控制

## 13. 风险和挑战

### 13.1 技术风险

**Service Worker 生命周期:**
- **风险**: Manifest V3 的 Service Worker 可能被浏览器终止
- **缓解**: 使用 chrome.alarms 保持活跃，重要状态持久化到 storage

**chrome.debugger API 限制:**
- **风险**: 一个标签页只能被一个 debugger 附加
- **缓解**: 检测冲突，提示用户关闭其他调试工具

**页面结构变化:**
- **风险**: 录制的脚本在页面更新后失效
- **缓解**: 多重定位策略、智能降级、视觉匹配

### 13.2 用户体验风险

**学习曲线:**
- **风险**: 用户不熟悉录制回放概念
- **缓解**: 提供详细文档、视频教程、示例脚本

**性能影响:**
- **风险**: 扩展可能影响浏览器性能
- **缓解**: 按需启用 debugger、优化 DOM 查询、异步处理

## 14. 总结

本设计文档描述了一个完整的浏览器自动化插件系统，核心特点：

1. **扩展主导架构**: 利用浏览器扩展的完整 API 能力
2. **MCP 集成**: 与 AI 工具无缝集成
3. **智能特性**: 多重定位、智能等待、错误恢复
4. **完整功能**: 录制回放、会话管理、多标签页控制

**关键设计决策:**
- 使用 chrome.debugger API 而非远程调试端口
- WebSocket 通信而非 Native Messaging
- 扩展主导而非服务器主导
- TypeScript 全栈开发

**下一步:**
- 编写详细的实现计划
- 搭建项目脚手架
- 实现核心功能模块
- 编写测试用例

