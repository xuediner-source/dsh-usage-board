/**
 * dsh-usage-board — host half.
 * GET /api/usage-board
 * Built-in providers: grok, opencode, deepseek.
 * Extra adapters: ~/.dsh/usage-board/providers/*.js
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { httpsJson, errorText } from "./http.js";
import grok from "./providers/grok.js";
import opencode from "./providers/opencode.js";
import deepseek from "./providers/deepseek.js";

const name = "dsh-usage-board";
const inject = ["credentials", "webServer"];
const ROUTE_PATH = "/api/usage-board";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const builtins = [grok, opencode, deepseek];

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function boardHome() {
  const root = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(root, "usage-board");
}

function loadConfig() {
  const path = join(boardHome(), "config.json");
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function loadExternalProviders(logger) {
  const dir = join(boardHome(), "providers");
  if (!existsSync(dir)) return [];
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".mjs")); } catch { return []; }
  const out = [];
  for (const file of files) {
    try {
      const href = pathToFileURL(join(dir, file)).href + "?t=" + Date.now();
      const mod = await import(href);
      const provider = mod.default || mod.provider || mod;
      if (!provider || typeof provider.id !== "string" || typeof provider.fetch !== "function") {
        logger?.warn("dsh-usage-board: skip " + file + " (need export default { id, fetch })");
        continue;
      }
      out.push(provider);
    } catch (error) {
      logger?.warn("dsh-usage-board: failed to load " + file);
      logger?.warn(error);
    }
  }
  return out;
}

function snapshotError(provider, error, skipped) {
  return {
    id: provider.id,
    label: provider.label || provider.id,
    ok: false,
    skipped: !!skipped,
    error: typeof error === "string" ? error : errorText(error)
  };
}

async function runProvider(provider, ctx) {
  try {
    const result = await provider.fetch({
      credentials: ctx.credentials,
      httpsJson,
      env: process.env,
      logger: ctx.logger
    });
    if (!result || typeof result !== "object") return snapshotError(provider, "adapter returned empty result");
    return {
      id: result.id || provider.id,
      label: result.label || provider.label || provider.id,
      ok: result.ok !== false && !result.skipped,
      skipped: !!result.skipped,
      headline: result.headline || null,
      percent: typeof result.percent === "number" ? result.percent : null,
      resetAt: result.resetAt || null,
      details: Array.isArray(result.details) ? result.details : [],
      error: result.error || null
    };
  } catch (error) {
    return snapshotError(provider, error);
  }
}

function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: "exact",
      path: ROUTE_PATH,
      handler: async (_req, res) => {
        try {
          const config = loadConfig();
          const extra = await loadExternalProviders(ctx.logger);
          const seen = new Set();
          const all = [];
          for (const p of [...extra, ...builtins]) {
            if (!p?.id || seen.has(p.id)) continue;
            seen.add(p.id);
            all.push(p);
          }
          const enabled = Array.isArray(config.enabled) && config.enabled.length
            ? all.filter((p) => config.enabled.includes(p.id))
            : all;
          const order = Array.isArray(config.order) ? config.order : ["grok", "opencode", "deepseek"];
          enabled.sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          });
          const providers = await Promise.all(enabled.map((p) => runProvider(p, ctx)));
          sendJson(res, 200, { ok: true, providers, fetchedAt: new Date().toISOString() });
        } catch (error) {
          ctx.logger.warn("dsh-usage-board: failed");
          ctx.logger.warn(error);
          sendJson(res, 502, { ok: false, error: "fetch-failed", message: errorText(error) });
        }
      }
    }),
    "dsh-usage-board: usage route"
  );
}

export { name, inject, apply };
