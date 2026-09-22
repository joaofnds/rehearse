import { describe, expect, it } from "bun:test";
import { plural } from "./plural";

describe(plural.name, () => {
	it("counts one of a noun in the singular", () => {
		expect(plural(1, "file")).toBe("1 file");
	});

	it.each([0, 2, 137])("counts %i of a noun in the plural", (count) => {
		expect(plural(count, "file")).toBe(`${count} files`);
	});
});
