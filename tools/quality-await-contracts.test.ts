import { describe, expect, it } from "bun:test";

import ruleDiagnostics from "./oxlint/anti-slop/rule-test-support";

const sourceContract =
	"interface TextSource { readonly read: () => Promise<string>; readonly ready: () => Promise<void>; } ";

const awaitedForwarders = [
	`${sourceContract}async function read(source: TextSource): Promise<string> { return await source.read(); } export { read as default };`,
	`${sourceContract}async function read(source: TextSource): Promise<string> { const result = await source.read(); return result; } export { read as default };`,
	`${sourceContract}async function read(source: TextSource): Promise<string> { try { return await source.read(); } catch (error) { throw new Error('Read failed', { cause: error }); } } export { read as default };`,
];

describe("awaited promise forwarding", () => {
	it.each(awaitedForwarders)(
		"accepts an awaited completion: %s",
		async (source) => {
			const diagnostics = await ruleDiagnostics(source, ["--type-aware"]);

			expect(diagnostics).toEqual([]);
		},
	);

	describe("when forwarding violates the awaited operation contract", () => {
		it("rejects an unawaited promise return even after an earlier await", async () => {
			const diagnostics = await ruleDiagnostics(
				`${sourceContract}async function read(source: TextSource): Promise<string> { await source.ready(); return source.read(); } export { read as default };`,
				["--type-aware"],
			);

			expect(diagnostics.map(({ code }) => code)).toContain(
				"typescript(return-await)",
			);
		});

		it("rejects awaiting a synchronous operation", async () => {
			const diagnostics = await ruleDiagnostics(
				"async function read(operation: () => string): Promise<string> { return await operation(); } export { read as default };",
				["--type-aware"],
			);

			expect(diagnostics.map(({ code }) => code)).toContain(
				"typescript(await-thenable)",
			);
		});
	});
});
