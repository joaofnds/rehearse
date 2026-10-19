import { describe, expect, it } from "bun:test";

import fixtures from "./rule-fixtures.ts";
import ruleDiagnostics from "./rule-test-support.ts";

describe("anti-slop rule behavior", () => {
	it("rejects awaiting a synchronous next callback and dropping a promise continuation", async () => {
		const diagnostics = await ruleDiagnostics(
			`async function synchronous(next: () => void): Promise<void> { await next(); }
async function promised(next: () => Promise<void>): Promise<void> { next(); }
async function conditional(next: () => void, enabled: boolean): Promise<void> { await (enabled ? next() : Promise.resolve()); }
`,
			["--type-aware"],
		);
		const codes = diagnostics.map(({ code }) => code);
		expect(codes).toContain("typescript(await-thenable)");
		expect(codes).toContain("typescript(no-floating-promises)");
		expect(codes).toContain("typescript(no-confusing-void-expression)");
	});

	it.each([...fixtures])("$name", async (fixture) => {
		const code = `anti-slop(${fixture.rule})`;

		const diagnostics = await ruleDiagnostics(fixture.source);

		expect(
			diagnostics
				.filter((diagnostic) => diagnostic.code === code)
				.toSorted(
					(left, right) => left.line - right.line || left.column - right.column,
				),
		).toEqual(fixture.locations.map((location) => ({ code, ...location })));
	});
});
