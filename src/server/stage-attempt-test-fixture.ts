import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import { claimShortId } from "#benchmark/short-id";
import ApiTestHarness from "#server/api-test-harness";

const systems: ApiTestHarness[] = [];

async function startEvidenceApi({
	runsDirectory,
	corpusRoot,
}: {
	readonly runsDirectory: string;
	readonly corpusRoot: string;
}): Promise<ApiTestHarness["driver"]> {
	const system = await ApiTestHarness.setup({
		runsDirectory,
		source: directorySource(corpusRoot),
	});
	systems.push(system);

	return system.driver;
}

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function corpusDirectory(): Promise<string> {
	const root = await temporaryRoot("rehearse-stage-attempts-corpus-");
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
	await Bun.write(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await Bun.write(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	return root;
}

/**
 * The fixture's audit-log records claimed, with a stage-mode group at the
 * replayable run's build stage beside the replay already there.
 */
async function fixtureWithReplayAndRep(): Promise<RecordedRunsFixture> {
	const fixture = new RecordedRunsFixture(
		await temporaryRoot("rehearse-stage-attempts-"),
	);
	await fixture.write();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await fixture.confirmations.records.writeStageGroupWithReps("group-at-build");
	await claimShortId(fixture.runsDirectory, "audit-log", {
		groupId: "group-at-build",
		kind: "group",
		source: { run: fixture.replayableRun, stage: "build" },
	});

	return fixture;
}

async function clearStageAttemptRoots(): Promise<void> {
	await Promise.all(
		systems.splice(RESOURCE_DRAIN_START_INDEX).map(async (system) => {
			await system.teardown();
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function attemptsApi(): Promise<{
	readonly api: ApiTestHarness["driver"];
	readonly run: string;
}> {
	const fixture = await fixtureWithReplayAndRep();
	const corpusRoot = await corpusDirectory();

	return {
		api: await startEvidenceApi({
			corpusRoot,
			runsDirectory: fixture.runsDirectory,
		}),
		run: fixture.replayableRun,
	};
}

export {
	attemptsApi,
	temporaryRoot,
	corpusDirectory,
	fixtureWithReplayAndRep,
	clearStageAttemptRoots,
};
