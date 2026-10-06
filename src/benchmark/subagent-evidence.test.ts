import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordedSubagents } from "#benchmark/subagent-evidence";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function recordDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-subagents-"));
	roots.push(root);

	return root;
}

describe(recordedSubagents.name, () => {
	it("reads each kept sub-agent transcript with its meta file", async () => {
		const record = await recordDirectory();
		await mkdir(join(record, "subagents"));
		await Bun.write(join(record, "subagents", "agent-a1.jsonl"), "a1 rows\n");
		await Bun.write(join(record, "subagents", "agent-a1.meta.json"), "{}\n");
		await Bun.write(join(record, "subagents", "agent-a2.jsonl"), "a2 rows\n");

		const subagents = await recordedSubagents(record);

		expect(subagents).toEqual([
			{ agentId: "a1", transcript: "a1 rows\n", meta: "{}\n" },
			{ agentId: "a2", transcript: "a2 rows\n", meta: undefined },
		]);
	});

	it("reads no sub-agents from a record that kept none", async () => {
		const record = await recordDirectory();

		expect(await recordedSubagents(record)).toEqual([]);
	});

	it("skips a file the provider would not have named", async () => {
		const record = await recordDirectory();
		await mkdir(join(record, "subagents"));
		await Bun.write(join(record, "subagents", "notes.jsonl"), "stray\n");
		await Bun.write(join(record, "subagents", "agent-A1.jsonl"), "stray\n");

		expect(await recordedSubagents(record)).toEqual([]);
	});
});
