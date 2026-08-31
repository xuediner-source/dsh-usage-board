import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

export function authStorePath() {
  return join(dshHome(), "plugins", "subscriptions", "auth.json");
}

export function readHubSession(provider) {
  const path = authStorePath();
  if (!existsSync(path)) return null;
  try {
    const store = JSON.parse(readFileSync(path, "utf8"));
    const session = store && typeof store === "object" ? store[provider] : null;
    if (!session || typeof session !== "object") return null;
    if (typeof session.accessToken !== "string" || !session.accessToken) return null;
    return session;
  } catch {
    return null;
  }
}

export function skipped(id, label) {
  return { id, label, ok: false, skipped: true, error: "未在订阅中心登录" };
}

export function kindLabel(kind) {
  if (kind === "session") return "5 小时";
  if (kind === "weekly") return "本周";
  if (kind === "monthly" || kind === "other") return "本周期";
  if (kind === "lifetime") return "累计";
  return kind || "用量";
}

export function fromWindows(id, label, usage) {
  if (!usage || usage.supported === false) {
    return { id, label, ok: true, skipped: false, headline: "已登录", percent: null, details: [{ label: "用量", value: "暂无数据" }] };
  }
  const windows = Array.isArray(usage.windows) ? usage.windows : [];
  const percents = windows.map((w) => typeof w.usedPercent === "number" ? w.usedPercent : null).filter((n) => n !== null);
  const percent = percents.length ? Math.max(...percents) : null;
  const resetAt = windows.find((w) => w.resetsAt)?.resetsAt || null;
  const details = windows.map((w) => ({
    label: kindLabel(w.kind),
    value: typeof w.usedPercent === "number" ? (Math.round(w.usedPercent * 10) / 10) + "%" : (w.usedUsd != null ? "$" + w.usedUsd : "—"),
    extra: w.resetsAt ? new Date(w.resetsAt).toISOString() : null
  }));
  if (usage.plan) details.unshift({ label: "套餐", value: usage.plan });
  const headline = percent === null ? (usage.plan || "已登录") : (Math.round(percent * 10) / 10) + "%";
  return { id, label, ok: true, headline, percent, resetAt, details };
}
