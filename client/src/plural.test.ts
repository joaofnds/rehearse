import { describe, expect, it } from "bun:test";

import plural from "./plural";

describe(plural.name, () => {
	it("counts one of a noun in the singular", () => {
		const noun = { count: 1, expected: "1 file", singular: "file" };
		expect(plural(noun.count, noun.singular)).toBe(noun.expected);
	});

	it.each([
		{ count: 0, expected: "0 files" },
		{ count: 2, expected: "2 files" },
		{ count: 137, expected: "137 files" },
	])("counts $count of a noun in the plural", ({ count, expected }) => {
		expect(plural(count, "file")).toBe(expected);
	});

	it("counts a noun with an irregular plural in its given form", () => {
		const noun = {
			count: 2,
			expected: "2 registries",
			plural: "registries",
			singular: "registry",
		};
		expect(plural(noun.count, noun.singular, noun.plural)).toBe(noun.expected);
	});
});
