# dsh-usage-board

DeepSeek Harness Web 用量板：一块可拖动卡片，同时显示 **SuperGrok**、**OpenCode Go**、**DeepSeek** 额度，并留下扩展接口。

## 内置供应商

| id | 数据来源 | 凭证 |
|---|---|---|
| `grok` | `cli-chat-proxy.grok.com/v1/billing?format=credits` | `GROK_BUILD_ACCESS_TOKEN` 或 `~/.grok/auth.json` |
| `opencode` | `GET https://opencode.ai/zen/go/v1/usage` | `OPENCODE_API_KEY` |
| `deepseek` | `GET https://api.deepseek.com/user/balance` | `DEEPSEEK_API_KEY` |

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

`httpsJson` 走 Node `https`（带浏览器 UA、失败时走本地代理），不要用 DSH 全局 `fetch` 打 Cloudflare 站点。

可选配置 `~/.dsh/usage-board/config.json`：

```json
{
  "enabled": ["grok", "opencode", "deepseek", "my-llm"],
  "order": ["grok", "opencode", "deepseek", "my-llm"]
}
```

示例文件见 `docs/example-provider.js`。

## 协议

MIT
