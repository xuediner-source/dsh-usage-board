import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorText, envProxy } from "../lib/http.js";

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
