import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { recordCheckpoint } from "./checkpoint";
import {
	sessionFixture,
	writeSessionFiles,
} from "./checkpoint-session-test-fixture";
import {
	CheckpointInputsBuilder,
	checkpointFixture,
} from "./checkpoint-workflow-test-fixture";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function testPreservesTheStageSRawSessionTranscriptBesideTheCheckpoint(): Promise<void> {
	const { targetDir, checkpointDir, projectsDirectory, sessionId, slug } =
		await sessionFixture(testResources);
	const raw = `{"type":"user"}\n{"type":"assistant"}\n`;
	await writeSessionFiles({ raw, sessionId, slug });

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder({
			transcript: { projectsDirectory, sessionId },
		}).build(),
	);

	expect(record.transcript).toEqual({
		file: "transcript.jsonl",
		sessionId,
		status: "AVAILABLE",
	});
	expect(await Bun.file(join(checkpointDir, "transcript.jsonl")).text()).toBe(
		raw,
	);
}

async function testPreservesTheStageSessionSSubAgentTranscriptsAndMetaFilesBesideItsTranscript(): Promise<void> {
	const { targetDir, checkpointDir, projectsDirectory, sessionId, slug } =
		await sessionFixture(testResources);
	const child = `{"type":"assistant"}\n`;
	const meta = `{"agentType":"reviewer","spawnDepth":1}\n`;
	await writeSessionFiles({
		child,
		meta,
		raw: `{"type":"user"}\n`,
		sessionId,
		slug,
	});

	await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder({
			transcript: { projectsDirectory, sessionId },
		}).build(),
	);

	const retained = join(checkpointDir, "subagents");
	const names = await readdir(retained);
	expect(names.toSorted()).toEqual(["agent-a1.jsonl", "agent-a1.meta.json"]);
	expect(await Bun.file(join(retained, "agent-a1.jsonl")).text()).toBe(child);
	expect(await Bun.file(join(retained, "agent-a1.meta.json")).text()).toBe(
		meta,
	);
}

async function testLeavesTheStageSessionSProviderFilesInTheTargetRepositorySSlug(): Promise<void> {
	const { targetDir, checkpointDir, projectsDirectory, sessionId, slug } =
		await sessionFixture(testResources);
	await writeSessionFiles({
		child: `{"type":"assistant"}\n`,
		raw: `{"type":"user"}\n`,
		sessionId,
		slug,
	});

	await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder({
			transcript: { projectsDirectory, sessionId },
		}).build(),
	);

	const left = await readdir(slug, { recursive: true });
	expect(left.toSorted()).toEqual([
		sessionId,
		`${sessionId}.jsonl`,
		join(sessionId, "subagents"),
		join(sessionId, "subagents", "agent-a1.jsonl"),
	]);
}

async function testRecordsAnAbsentStageTranscriptAsUnavailable(): Promise<void> {
	const { targetDir, checkpointDir, projectsDirectory, sessionId } =
		await sessionFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder({
			transcript: { projectsDirectory, sessionId },
		}).build(),
	);

	expect(record.transcript).toEqual({ sessionId, status: "UNAVAILABLE" });
	expect(await Bun.file(join(checkpointDir, "transcript.jsonl")).exists()).toBe(
		false,
	);
}

async function testOmitsTheTranscriptFieldWhenNoSessionIsSupplied(): Promise<void> {
	const { targetDir, checkpointDir } = await checkpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);

	expect(record.transcript).toBeUndefined();
}

describe("checkpoint transcript retention", () => {
	it(
		"preserves the stage's raw session transcript beside the checkpoint",
		testPreservesTheStageSRawSessionTranscriptBesideTheCheckpoint,
	);
	it(
		"preserves the stage session's sub-agent transcripts and meta files beside its transcript",
		testPreservesTheStageSessionSSubAgentTranscriptsAndMetaFilesBesideItsTranscript,
	);
	it(
		"leaves the stage session's provider files in the target repository's slug",
		testLeavesTheStageSessionSProviderFilesInTheTargetRepositorySSlug,
	);
	it(
		"records an absent stage transcript as unavailable",
		testRecordsAnAbsentStageTranscriptAsUnavailable,
	);
	it(
		"omits the transcript field when no session is supplied",
		testOmitsTheTranscriptFieldWhenNoSessionIsSupplied,
	);
});
