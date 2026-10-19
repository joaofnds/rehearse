import { expect, it } from "bun:test";

import { qualitySourceFailures } from "./quality-policy";

it.each(["oxlint", "eslint", "stylelint"])(
	"rejects %s suppression comments",
	async (tool) => {
		const source = `// ${tool}-disable-next-line no-unused-vars\nconst value = 1;`;

		expect(await qualitySourceFailures("src/example.ts", source)).not.toEqual(
			[],
		);
	},
);

it.each(["oxfmt", "prettier", "biome"])(
	"rejects %s formatter bypasses",
	async (tool) => {
		const source = `/* ${tool}-ignore */\nconst value=1;`;

		expect(await qualitySourceFailures("src/example.ts", source)).not.toEqual(
			[],
		);
	},
);

it("accepts ordinary source comments", async () => {
	expect(
		await qualitySourceFailures(
			"src/example.ts",
			"// Count recorded attempts.\n",
		),
	).toEqual([]);
});

it.each([
	["docs/example.md", "<!--", " -->"],
	["example.yml", "#", ""],
])("rejects formatter bypasses in %s", async (path, opener, closer) => {
	const marker = ["prettier", "ignore"].join("-");

	expect(
		await qualitySourceFailures(path, `${opener} ${marker}${closer}`),
	).not.toEqual([]);
});
