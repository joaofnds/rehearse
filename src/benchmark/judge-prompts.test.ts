import { describe, expect, it } from "bun:test";

import JudgePromptHarness from "./judge-prompts-test-support";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

// Exact initial provider prompts captured from d020bf3a through the same real
// workflow, checks and stage-input producers. These are experimental bytes.
describe("initial judge evidence prompts", () => {
	it.each(["planning", "delivery"] as const)(
		"retains the parent %s session prompt byte for byte",
		async (kind) => {
			const harness = await JudgePromptHarness.create(resources);
			const expected = await Bun.file(
				new URL(
					`__fixtures__/judge-prompts/${kind}-session.txt`,
					import.meta.url,
				),
			).text();

			const prompt = await harness.stage(kind);

			expect(prompt).toBe(expected);
		},
	);

	it.each(["planning", "delivery"] as const)(
		"retains the parent parsed %s record prompt byte for byte",
		async (kind) => {
			const harness = await JudgePromptHarness.create(resources);
			const expected = await Bun.file(
				new URL(
					`__fixtures__/judge-prompts/${kind}-record.txt`,
					import.meta.url,
				),
			).text();

			const prompt = await harness.stage(kind, "record");

			expect(prompt).toBe(expected);
		},
	);

	it("retains the parent final judge prompt byte for byte", async () => {
		const harness = await JudgePromptHarness.create(resources);
		const expected = await Bun.file(
			new URL("__fixtures__/judge-prompts/final-session.txt", import.meta.url),
		).text();

		const prompt = await harness.final();

		expect(prompt).toBe(expected);
	});
});
