import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import pathIsWithin from "./path-containment";

describe("pathIsWithin", () => {
	const root = resolve("saved-runs");

	test.each([
		["the root", root, true],
		["a descendant", resolve(root, "sessions", "attempt.json"), true],
		["the parent", resolve(root, ".."), false],
		["a sibling with the same prefix", `${root}-archive`, false],
		[
			"a traversal outside the root",
			resolve(root, "nested", "..", ".."),
			false,
		],
	] as const)("recognizes %s", (_description, candidate, expected) => {
		expect(pathIsWithin(candidate, root)).toBe(expected);
	});
});
