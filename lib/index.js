/**
 * dsh-usage-board — host half.
 * GET /api/usage-board
 * Built-in providers: gemini, gpt, grok-sub, claude, openrouter, qwen, agnes, spark, ernie, grok, opencode, deepseek.
 * Extra adapters: ~/.dsh/usage-board/providers/*.js
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { httpsJson, errorText } from "./http.js";
import { collectPiAiProviders, collectLlmRoutes, wantedFromSources, sortProviders, validProviderId, withoutSkipped, DEFAULT_ORDER } from "./detect.js";
import { collectHubLogins, readAuthStore } from "./providers/hub-session.js";
import grok from "./providers/grok.js";
import opencode from "./providers/opencode.js";
import deepseek from "./providers/deepseek.js";
import gemini from "./providers/gemini.js";
import gpt from "./providers/gpt.js";
import grokSub from "./providers/grok-sub.js";
import claude from "./providers/claude.js";
import openrouter from "./providers/openrouter.js";
import qwen from "./providers/qwen.js";
import agnes from "./providers/agnes.js";
import spark from "./providers/spark.js";
import ernie from "./providers/ernie.js";

const name = "dsh-usage-board";
const inject = ["credentials", "webServer"];
const ROUTE_PATH = "/api/usage-board";
const JSON_HEADERS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};
const PROVIDER_TIMEOUT_MS = 12000;
const SNAPSHOT_TTL_MS = 20 * 1000;
const EXTERNAL_TTL_MS = 30 * 1000;

const builtins = [gemini, gpt, grokSub, claude, openrouter, qwen, agnes, spark, ernie, grok, opencode, deepseek];

let snapshotCache = { expires: 0, body: null };
let extraCache = { expires: 0, key: "", providers: [] };

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
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

async function hasDeepseekKey(ctx) {
	try {
		const hit = await ctx.credentials.resolve("DEEPSEEK_API_KEY");
		return !!(hit && hit.value);
	} catch {
		return false;
	}
}

async function wantedBoardIds(ctx) {
	const extraIds = [];
	if (await hasDeepseekKey(ctx)) extraIds.push("deepseek");
	return wantedFromSources({
		hubLogins: collectHubLogins(readAuthStore()),
		routes: [...collectPiAiProviders(ctx.get("settings")), ...collectLlmRoutes(ctx)],
		extraIds
	});
}

function extraFingerprint(dir) {
	try {
		const files = readdirSync(dir).filter((f) => validProviderId(f.replace(/\.(js|mjs)$/, "")) && (f.endsWith(".js") || f.endsWith(".mjs"))).sort();
		return files.map((f) => {
			try {
				const st = statSync(join(dir, f));
				return f + ":" + st.mtimeMs + ":" + st.size;
			} catch {
				return f;
			}
		}).join("|");
	} catch {
		return "";
	}
}

async function loadExternalProviders(logger) {
	const dir = join(boardHome(), "providers");
	if (!existsSync(dir)) return [];
	const key = extraFingerprint(dir);
	if (extraCache.key === key && extraCache.expires > Date.now()) return extraCache.providers;
	let files = [];
	try {
		files = readdirSync(dir).filter((f) => {
			if (!(f.endsWith(".js") || f.endsWith(".mjs"))) return false;
			return validProviderId(f.replace(/\.(js|mjs)$/, ""));
		});
	} catch {
		return [];
	}
	const out = [];
	for (const file of files) {
		try {
			const href = pathToFileURL(join(dir, file)).href + "?t=" + extraFingerprint(dir);
			const mod = await import(href);
			const provider = mod.default || mod.provider || mod;
			if (!provider || !validProviderId(provider.id) || typeof provider.fetch !== "function") {
				logger?.warn("dsh-usage-board: skip " + file + " (need export default { id, fetch } with kebab-case id)");
				continue;
			}
			out.push(provider);
		} catch (error) {
			logger?.warn("dsh-usage-board: failed to load " + file);
			logger?.warn(error);
		}
	}
	extraCache = { expires: Date.now() + EXTERNAL_TTL_MS, key, providers: out };
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

function withTimeout(promise, ms, label) {
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(label + " timed out after " + ms + "ms")), ms);
		if (typeof timer.unref === "function") timer.unref();
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runProvider(provider, ctx) {
	try {
		const result = await withTimeout(provider.fetch({
			credentials: ctx.credentials,
			httpsJson,
			env: process.env,
			logger: ctx.logger
		}), PROVIDER_TIMEOUT_MS, provider.id);
		if (!result || typeof result !== "object") return snapshotError(provider, "adapter returned empty result");
		return {
			id: result.id || provider.id,
			label: result.label || provider.label || provider.id,
			ok: result.ok !== false && !result.skipped,
			skipped: !!result.skipped,
			headline: result.headline || null,
			percent: typeof result.percent === "number" && Number.isFinite(result.percent) ? result.percent : null,
			resetAt: result.resetAt || null,
			details: Array.isArray(result.details) ? result.details : [],
			extra: result.extra && typeof result.extra === "object" ? result.extra : null,
			error: result.error || null
		};
	} catch (error) {
		return snapshotError(provider, error);
	}
}

async function buildSnapshot(ctx) {
	const config = loadConfig();
	const extra = await loadExternalProviders(ctx.logger);
	const seen = new Set();
	const all = [];
	for (const p of [...extra, ...builtins]) {
		if (!p?.id || seen.has(p.id) || !validProviderId(p.id)) continue;
		seen.add(p.id);
		all.push(p);
	}
	const auto = await wantedBoardIds(ctx);
	const enabled = Array.isArray(config.enabled) && config.enabled.length
		? all.filter((p) => config.enabled.includes(p.id))
		: all.filter((p) => (auto.size === 0 ? false : auto.has(p.id)));
	const order = Array.isArray(config.order) ? config.order : DEFAULT_ORDER;
	const ranked = sortProviders(enabled, order);
	const providers = withoutSkipped(await Promise.all(ranked.map((p) => runProvider(p, ctx))));
	return { ok: true, providers, fetchedAt: new Date().toISOString() };
}

function apply(ctx) {
	ctx.effect(
		() => ctx.webServer.register({
			kind: "exact",
			path: ROUTE_PATH,
			handler: async (_req, res) => {
				try {
					if (snapshotCache.body && snapshotCache.expires > Date.now()) {
						sendJson(res, 200, snapshotCache.body);
						return;
					}
					const body = await buildSnapshot(ctx);
					snapshotCache = { expires: Date.now() + SNAPSHOT_TTL_MS, body };
					sendJson(res, 200, body);
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
