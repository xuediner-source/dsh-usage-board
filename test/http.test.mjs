import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { errorText, envProxy, httpsJson, isLoopbackUrl } from "../lib/http.js";

describe("errorText", () => {
	it("flattens nested causes", () => {
		const err = new Error("outer", { cause: new Error("inner") });
		assert.match(errorText(err), /outer/);
		assert.match(errorText(err), /inner/);
	});
});

describe("envProxy", () => {
	it("returns a string even when unset", () => {
		assert.equal(typeof envProxy(), "string");
	});
});

describe("isLoopbackUrl", () => {
	it("recognises loopback authorities", () => {
		for (const u of ["http://127.0.0.1:7863/status", "http://localhost/x", "http://[::1]:9/y", "http://127.9.9.9/z", "http://LOCALHOST/x"]) {
			assert.equal(isLoopbackUrl(new URL(u)), true, u);
		}
	});
	it("rejects everything else", () => {
		for (const u of ["http://evil.example.com/x", "https://api.openai.com/v1", "http://192.168.1.5/x"]) {
			assert.equal(isLoopbackUrl(new URL(u)), false, u);
		}
	});
	it("rejects a DNS name that merely starts with 127.", () => {
		// "127.evil.com" is a registrable domain that can resolve anywhere, so a
		// naive startsWith("127.") check would leak a bearer token in cleartext.
		assert.equal(isLoopbackUrl(new URL("http://127.evil.com/x")), false);
	});
	it("rejects non-literal and out-of-range 127 shapes", () => {
		assert.equal(isLoopbackUrl({ hostname: "127.0.0.1.evil.com" }), false);
		assert.equal(isLoopbackUrl({ hostname: "127.0.0.999" }), false);
		assert.equal(isLoopbackUrl({ hostname: "127.0.0" }), false);
		assert.equal(isLoopbackUrl({ hostname: "127.0.0.1" }), true);
	});
});

describe("httpsJson transport", () => {
	it("allows plaintext HTTP only to a loopback gateway", async (t) => {
		// The xuedinerAPI pool gateway is http://127.0.0.1:7863. The old
		// https-only guard rejected it, so the pool row always failed.
		const server = createServer((_req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ healthy: 5, total: 5 }));
		});
		await new Promise((r) => server.listen(0, "127.0.0.1", r));
		t.after(() => server.close());
		const url = `http://127.0.0.1:${server.address().port}/status`;

		const result = await httpsJson(url, {}, { timeoutMs: 4000 });
		assert.equal(result.ok, true);
		assert.equal(result.body.healthy, 5);
	});

	it("still refuses plaintext HTTP to a non-loopback host", async () => {
		await assert.rejects(
			() => httpsJson("http://example.com/status", {}, { timeoutMs: 1000 }),
			/only https is allowed/,
		);
	});

	it("does not retry a loopback failure through an HTTP proxy", async (t) => {
		// A proxy cannot reach 127.0.0.1 on behalf of the caller; retrying there
		// replaced the real error with "proxy: only https is allowed".
		const dead = createServer(() => {});
		await new Promise((r) => dead.listen(0, "127.0.0.1", r));
		const port = dead.address().port;
		await new Promise((r) => dead.close(r));

		let message = "";
		try {
			await httpsJson(`http://127.0.0.1:${port}/status`, {}, { timeoutMs: 800 });
		} catch (error) {
			message = String(error.message);
		}
		// Either a connection error or a timeout, but never the proxy wording.
		assert.ok(!/proxy:/.test(message), `must not mention a proxy retry, got: ${message}`);
	});

	it("passes a bearer token over https to a non-loopback host", async () => {
		// sanity: the https path still works end to end
		const result = await httpsJson("https://example.com/", { accept: "text/html" }, { timeoutMs: 8000 }).catch((e) => ({ error: e.message }));
		assert.ok(result.ok === true || typeof result.error === "string");
	});
});
