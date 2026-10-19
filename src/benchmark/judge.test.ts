import { describe, expect, it } from "bun:test";

import { parseRubricIds } from "./judge";

describe(parseRubricIds.name, () => {
	it("derives requirement IDs from the rubric", () => {
		const ids = parseRubricIds(
			"1. `first`: First requirement.\n2. `new-check`: New requirement.\n",
		);

		expect(ids).toEqual(["first", "new-check"]);
	});

	it("rejects duplicate requirement IDs", () => {
		expect(() =>
			parseRubricIds("1. `same`: First.\n2. `same`: Duplicate.\n"),
		).toThrow("unique requirement IDs");
	});
});
