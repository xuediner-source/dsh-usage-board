# dsh-usage-board

[English](#english) | [中文说明](#中文说明)

---

## 中文说明

DeepSeek Harness Web 用量板：一块可拖动悬浮卡片，按当前 **模型提供方** 和 **订阅中心登录** 自动显示额度。未登录、未配置的提供方不会出现。

### 🌟 特性

- **自动检测**：扫描设置里的模型提供方、已注册 LLM 路由、以及 [`dsh-subs-hub`](https://github.com/xuediner-source/dsh-subs-hub) 落下的登录。
- **断流容灾**：用量请求走 Node `https`（带浏览器 UA）；直连失败时再尝试本机代理，避免 Cloudflare / 掐流把卡片打空。
- **快照缓存与单卡超时**：整板快照缓存 20 秒；每个 provider 12 秒超时，避免一家卡住拖死整块看板。
- **安全加载外部适配器**：`~/.dsh/usage-board/providers/` 只加载 kebab-case 文件名（拒绝 `../` 等路径）。
- **中英双语 UI**：根据浏览器语言切换文案；错误可一键复制。

令牌只在本机使用。浏览器只请求 `GET /api/usage-board`。

### 📋 自动显示

| 卡片 | 何时出现 | 数据来源 |
|---|---|---|
| Gemini | 订阅中心登录 Gemini | Antigravity quota |
| GPT | 订阅中心登录 GPT | ChatGPT Codex usage |
| Grok | 订阅中心登录 Grok | Grok CLI billing |
| Claude | 订阅中心登录 Claude | Anthropic OAuth usage |
| OpenRouter / Qwen / Agnes / Spark / ERNIE | 订阅中心对应登录 | 登录态（无公开用量接口时显示已登录） |
| OpenCode | 模型里有 OpenCode 提供方 | `OPENCODE_API_KEY` |
| DeepSeek | 模型 id 含 deepseek，或本机有 `DEEPSEEK_API_KEY` | `DEEPSEEK_API_KEY` |
| SuperGrok | 本机 grok CLI / `GROK_BUILD_ACCESS_TOKEN` | Grok billing |

### 🚀 安装

```sh
dsh plugin --profile desktop add github:xuediner-source/dsh-usage-board
```

重启 DSH 后强制刷新。建议同时安装 [`dsh-subs-hub`](https://github.com/xuediner-source/dsh-subs-hub)。

### 🧩 扩展更多模型

把适配器放到 `~/.dsh/usage-board/providers/<name>.js`。必须 `export default { id, label, fetch }`，`id` 为 kebab-case。`fetch` 收到 `{ credentials, httpsJson, env, logger }`。

示例见 `docs/example-provider.js`。

可选配置 `~/.dsh/usage-board/config.json`（填写 `enabled` 后关闭自动检测，只显示 listed id）：

```json
{
  "enabled": ["gemini", "gpt", "grok-sub", "claude", "opencode", "deepseek"],
  "order": ["gemini", "gpt", "grok-sub", "claude", "opencode", "deepseek"]
}
```

### 🧪 测试

```sh
npm run check
npm test
```

### 协议

MIT

---

<a name="english"></a>
## English

DeepSeek Harness usage overlay: a draggable card that auto-detects **model providers** and **subscription-hub logins**. Unconfigured providers stay hidden.

### Highlights

- Auto-detects settings, LLM routes, and [`dsh-subs-hub`](https://github.com/xuediner-source/dsh-subs-hub) sessions.
- Direct HTTPS first, then local proxy fallback. Snapshot cache (20s) and per-provider timeout (12s).
- External adapters only load kebab-case filenames from `~/.dsh/usage-board/providers/`.
- Bilingual UI (zh / en) with one-click error copy.

Tokens never leave this machine. The browser only calls `GET /api/usage-board`.

### Install

```sh
dsh plugin --profile desktop add github:xuediner-source/dsh-usage-board
```

### Tests

```sh
npm run check
npm test
```

### License

MIT © [xuediner-source](https://github.com/xuediner-source)
