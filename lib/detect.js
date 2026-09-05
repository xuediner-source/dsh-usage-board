/**
 * Provider auto-detection: model settings, LLM routes, and subs-hub logins.
 * Pure helpers are exported for unit tests.
 */

export const ROUTE_ALIASES = {
	gemini: ["gemini", "antigravity", "google-antigravity"],
	gpt: ["gpt", "codex", "openai-codex", "chatgpt"],
	"grok-sub": ["grok", "grok-sub", "xai"],
	claude: ["claude", "anthropic"],
	opencode: ["opencode", "opencode-go", "opencode-go-responses"],
	deepseek: ["deepseek", "llm-deepseek"],
	openrouter: ["openrouter"],
	qwen: ["qwen", "qwen-code", "dashscope"],
	agnes: ["agnes", "agnes-ai"],
	spark: ["spark", "iflytek", "iflytek-spark"],
	ernie: ["ernie", "baidu", "wenxin"]
};

export const DEFAULT_ORDER = [
	"gemini",
	"gpt",
	"grok-sub",
	"claude",
	"openrouter",
	"qwen",
	"agnes",
	"spark",
	"ernie",
	"opencode",
	"deepseek",
	"grok"
];

/** Cards that only appear after a real dsh-subs-hub login (access token present). */
export const HUB_BOARD_IDS = [
	"gemini",
	"gpt",
	"grok-sub",
	"claude",
	"openrouter",
	"qwen",
	"agnes",
	"spark",
	"ernie"
];

export function validProviderId(id) {
	return typeof id === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(id);
}

/**
 * Collect provider ids from the llm-pi-ai settings section.
 * Never mutates the source object; never grows the iteration list in place.
 */
export function collectPiAiProviders(settings) {
	try {
		if (!settings || typeof settings.get !== "function") return [];
		const section = settings.get("llm-pi-ai");
		const providers = section && typeof section === "object" ? section.providers : null;
		if (!providers || typeof providers !== "object") return [];
		const out = [];
		const seen = new Set();
		const push = (id) => {
			if (typeof id !== "string" || !id || seen.has(id)) return;
			seen.add(id);
			out.push(id);
		};
		for (const id of Object.keys(providers)) {
			const entry = providers[id];
			if (!entry || typeof entry !== "object") continue;
			push(id);
			const models = entry.models;
			if (!Array.isArray(models)) continue;
			for (const model of models) {
				const mid = typeof model === "string" ? model : model?.id;
				if (typeof mid === "string" && mid.toLowerCase().includes("deepseek")) push("deepseek");
			}
		}
		return out;
	} catch {
		return [];
	}
}

export function collectLlmRoutes(ctx) {
	const ids = [];
	try {
		const llm = ctx?.get?.("llm");
		if (!llm) return ids;
		if (typeof llm.listProviders === "function") {
			const listed = llm.listProviders();
			if (Array.isArray(listed)) {
				for (const item of listed) {
					if (typeof item === "string") ids.push(item);
					else if (item && typeof item.id === "string") ids.push(item.id);
				}
			}
		}
	} catch {}
	return ids;
}

export function matchWanted(routes, aliases = ROUTE_ALIASES) {
	const wanted = new Set();
	const set = routes instanceof Set ? routes : new Set(Array.isArray(routes) ? routes : []);
	for (const [boardId, list] of Object.entries(aliases)) {
		if (Array.isArray(list) && list.some((alias) => set.has(alias))) wanted.add(boardId);
	}
	return wanted;
}

/**
 * Hub-backed cards require an actual subs-hub session.
 * Installing dsh-subs-hub registers LLM routes for every provider even when
 * logged out — those route ids must not light up empty quota rows.
 */
export function wantedFromSources({ hubLogins = [], routes = [], extraIds = [] } = {}, aliases = ROUTE_ALIASES) {
	const hubSet = new Set(HUB_BOARD_IDS);
	const wanted = matchWanted(hubLogins, aliases);
	for (const id of matchWanted(routes, aliases)) {
		if (!hubSet.has(id)) wanted.add(id);
	}
	for (const id of extraIds) {
		if (typeof id === "string" && id) wanted.add(id);
	}
	return wanted;
}

export function withoutSkipped(providers) {
	return (Array.isArray(providers) ? providers : []).filter((p) => p && p.skipped !== true);
}

export function sortProviders(providers, order = DEFAULT_ORDER) {
	const list = Array.isArray(order) ? order : DEFAULT_ORDER;
	return [...providers].sort((a, b) => {
		const ia = list.indexOf(a.id);
		const ib = list.indexOf(b.id);
		return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
	});
}
