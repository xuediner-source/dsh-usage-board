import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collectPiAiProviders, matchWanted, sortProviders, validProviderId, DEFAULT_ORDER } from "../lib/detect.js";
import { collectHubLogins, fromWindows, kindLabel } from "../lib/providers/hub-session.js";

describe("validProviderId", () => {
	it("accepts kebab-case ids", () => {
		assert.equal(validProviderId("gemini"), true);
		assert.equal(validProviderId("grok-sub"), true);
		assert.equal(validProviderId("openrouter"), true);
	});
	it("rejects unsafe ids", () => {
		assert.equal(validProviderId("../evil"), false);
		assert.equal(validProviderId("HasCap"), false);
		assert.equal(validProviderId(""), false);
		assert.equal(validProviderId("a".repeat(50)), false);
	});
});

describe("collectPiAiProviders", () => {
	it("does not grow the iteration list when a model id contains deepseek", () => {
		const settings = {
			get(key) {
				if (key !== "llm-pi-ai") return undefined;
				return {
					providers: {
						alpha: { models: ["gpt-4o", "deepseek-chat"] },
						beta: { models: ["claude-3"] }
					}
				};
			}
		};
		const ids = collectPiAiProviders(settings);
		assert.deepEqual(ids, ["alpha", "deepseek", "beta"]);
		assert.equal(ids.filter((id) => id === "deepseek").length, 1);
	});
	it("returns empty on missing or invalid settings", () => {
		assert.deepEqual(collectPiAiProviders(null), []);
		assert.deepEqual(collectPiAiProviders({ get: () => null }), []);
	});
});

describe("matchWanted", () => {
	it("maps hub logins and aliases onto board ids", () => {
		const wanted = matchWanted(["antigravity", "codex", "qwen", "openrouter", "ernie"]);
		assert.equal(wanted.has("gemini"), true);
		assert.equal(wanted.has("gpt"), true);
		assert.equal(wanted.has("qwen"), true);
		assert.equal(wanted.has("openrouter"), true);
		assert.equal(wanted.has("ernie"), true);
		assert.equal(wanted.has("claude"), false);
	});
});

describe("collectHubLogins", () => {
	it("keeps only sessions with an access token", () => {
		const ids = collectHubLogins({
			antigravity: { accessToken: "a" },
			codex: { refreshToken: "r" },
			qwen: { accessToken: "q" },
			empty: null
		});
		assert.deepEqual(ids, ["antigravity", "qwen"]);
	});
});

describe("sortProviders", () => {
	it("uses DEFAULT_ORDER and leaves unknown ids last", () => {
		const ranked = sortProviders([{ id: "deepseek" }, { id: "gemini" }, { id: "custom" }]);
		assert.deepEqual(ranked.map((p) => p.id), ["gemini", "deepseek", "custom"]);
		assert.ok(DEFAULT_ORDER.includes("qwen"));
	});
});

describe("fromWindows", () => {
	it("picks the highest used percent and ISO reset time", () => {
		const snap = fromWindows("gpt", "GPT", {
			supported: true,
			plan: "plus",
			windows: [
				{ kind: "session", usedPercent: 12.34, resetsAt: "2026-09-04T10:00:00.000Z" },
				{ kind: "weekly", usedPercent: 80.01, resetsAt: 1_725_000_000_000 }
			]
		});
		assert.equal(snap.ok, true);
		assert.equal(snap.percent, 80.01);
		assert.equal(snap.headline, "80%");
		assert.equal(snap.details[0].label, "套餐");
		assert.equal(kindLabel("session"), "5 小时");
	});
});
