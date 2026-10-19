import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { recordedSubagents } from "#benchmark/subagent-evidence";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
});

async function recordDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-subagents-"));
	roots.push(root);

	return root;
}

const recordedSubagentsReadsEachKeptSubagentTranscriptWithItsMetaFile =
	async (): Promise<void> => {
		const record = await recordDirectory();
		await mkdir(join(record, "subagents"));
		await Bun.write(join(record, "subagents", "agent-a1.jsonl"), "a1 rows\n");
		await Bun.write(join(record, "subagents", "agent-a1.meta.json"), "{}\n");
		await Bun.write(join(record, "subagents", "agent-a2.jsonl"), "a2 rows\n");

		const subagents = await recordedSubagents(record);

		expect(subagents).toEqual([
			{ agentId: "a1", meta: "{}\n", transcript: "a1 rows\n" },
			{ agentId: "a2", meta: undefined, transcript: "a2 rows\n" },
		]);
	};

const recordedSubagentsReadsNoSubagentsFromARecordThatKeptNone =
	async (): Promise<void> => {
		const record = await recordDirectory();

		expect(await recordedSubagents(record)).toEqual([]);
	};

const recordedSubagentsSkipsAFileTheProviderWouldNotHaveNamed =
	async (): Promise<void> => {
		const record = await recordDirectory();
		await mkdir(join(record, "subagents"));
		await Bun.write(join(record, "subagents", "notes.jsonl"), "stray\n");
		await Bun.write(join(record, "subagents", "agent-A1.jsonl"), "stray\n");

		expect(await recordedSubagents(record)).toEqual([]);
	};

const recordedSubagentsReadsNoFileThroughASymlinkWhichCouldPointOutsideTheRecord =
	async (): Promise<void> => {
		const record = await recordDirectory();
		const outside = await recordDirectory();
		await Bun.write(join(outside, "secret.json"), "outside\n");
		await mkdir(join(record, "subagents"));
		await symlink(
			join(outside, "secret.json"),
			join(record, "subagents", "agent-a1.jsonl"),
		);
		await Bun.write(join(record, "subagents", "agent-a2.jsonl"), "a2 rows\n");
		await symlink(
			join(outside, "secret.json"),
			join(record, "subagents", "agent-a2.meta.json"),
		);

		expect(await recordedSubagents(record)).toEqual([
			{ agentId: "a2", meta: undefined, transcript: "a2 rows\n" },
		]);
	};

const recordedSubagentsKeepsTheOtherAgentsWhenOneEntryIsNotAFile =
	async (): Promise<void> => {
		const record = await recordDirectory();
		await mkdir(join(record, "subagents", "agent-a1.jsonl"), {
			recursive: true,
		});
		await Bun.write(join(record, "subagents", "agent-a2.jsonl"), "a2 rows\n");

		expect(await recordedSubagents(record)).toEqual([
			{ agentId: "a2", meta: undefined, transcript: "a2 rows\n" },
		]);
	};

describe(recordedSubagents.name, () => {
	it(
		"reads each kept sub-agent transcript with its meta file",
		recordedSubagentsReadsEachKeptSubagentTranscriptWithItsMetaFile,
	);

	it(
		"reads no sub-agents from a record that kept none",
		recordedSubagentsReadsNoSubagentsFromARecordThatKeptNone,
	);

	it(
		"skips a file the provider would not have named",
		recordedSubagentsSkipsAFileTheProviderWouldNotHaveNamed,
	);

	it(
		"reads no file through a symlink, which could point outside the record",
		recordedSubagentsReadsNoFileThroughASymlinkWhichCouldPointOutsideTheRecord,
	);

	it(
		"keeps the other agents when one entry is not a file",
		recordedSubagentsKeepsTheOtherAgentsWhenOneEntryIsNotAFile,
	);
});
