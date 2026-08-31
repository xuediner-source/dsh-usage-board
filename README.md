# dsh-usage-board

DeepSeek Harness Web 用量板：一块可拖动卡片，按当前 **模型提供方** 和 **订阅中心登录** 自动显示额度。

未登录、未配置的提供方不会出现。Grok 订阅与旧 SuperGrok 同时存在时只显示订阅 Grok。

## 自动显示

插件会扫描：

1. 设置 → 模型里的 `llm-pi-ai` 提供方（以及模型 id 含 `deepseek` 的线路）
2. 当前已注册的 LLM 路由
3. 订阅中心 [`dsh-subs-hub`](https://github.com/xuediner-source/dsh-subs-hub) 落下的登录

| 卡片 | 何时出现 | 数据来源 |
|---|---|---|
| Gemini | 订阅中心登录 Gemini | Antigravity quota |
| GPT | 订阅中心登录 GPT | ChatGPT Codex usage |
| Grok | 订阅中心登录 Grok | Grok CLI billing |
| Claude | 订阅中心登录 Claude | Anthropic OAuth usage |
| OpenCode | 模型里有 OpenCode 提供方 | `OPENCODE_API_KEY` |
| DeepSeek | 模型 id 含 deepseek，或本机有 `DEEPSEEK_API_KEY` | `DEEPSEEK_API_KEY` |
| SuperGrok | 仅当存在 `grok-build` 且没有 Grok 订阅 | `GROK_BUILD_ACCESS_TOKEN` |

令牌只在本机使用。浏览器只请求 `GET /api/usage-board`。

## 安装

```sh
dsh plugin --profile desktop add github:xuediner-source/dsh-usage-board
```

重启 DSH 后强制刷新。

## 扩展更多模型

把适配器放到：

`~/.dsh/usage-board/providers/<name>.js`

必须 `export default { id, label, fetch }`。`fetch` 收到 `{ credentials, httpsJson, env, logger }`，返回：

```js
export default {
  id: "my-llm",
  label: "My LLM",
  async fetch({ credentials, httpsJson }) {
    const hit = await credentials.resolve("MY_LLM_API_KEY");
    if (!hit) {
      return { id: "my-llm", label: "My LLM", skipped: true, error: "未配置 MY_LLM_API_KEY" };
    }
    const res = await httpsJson("https://api.example.com/v1/usage", {
      Authorization: "Bearer " + hit.value
    });
    if (!res.ok) return { id: "my-llm", label: "My LLM", ok: false, error: "HTTP " + res.status };
    return {
      id: "my-llm",
      label: "My LLM",
      ok: true,
      headline: "42%",
      percent: 42,
      resetAt: null,
      details: [{ label: "已用", value: "42%" }]
    };
  }
};
```

`httpsJson` 走 Node `https`（带浏览器 UA、失败时走本地代理），不要用 DSH 全局 `fetch` 打 Cloudflare 站点。支持 `{ method, body }`。

可选配置 `~/.dsh/usage-board/config.json`（填写 `enabled` 后关闭自动检测，只显示 listed id）：

```json
{
  "enabled": ["gemini", "gpt", "grok-sub", "claude", "opencode", "deepseek"],
  "order": ["gemini", "gpt", "grok-sub", "claude", "opencode", "deepseek"]
}
```

示例文件见 `docs/example-provider.js`。

## 协议

MIT
