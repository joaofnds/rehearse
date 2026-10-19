import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import ReadManifestEntryBuilder from "#benchmark/read-manifest-entry-test-builder";
import { mergeIntoRecord } from "#benchmark/recorded-runs-fixture-record-io";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

const recordedRead = new ReadManifestEntryBuilder({
	path: "CLAUDE.md",
	role: "global instructions",
}).build();
const recordedReads = [recordedRead];

afterEach(clearRunRecordRoots);

describe("/api/runs/:run", () => {
	it("keeps an absent read manifest unjudged", absentReadManifest);
	it(
		"still judges a stopped stage when a checkpoint corpus judgment fails",
		independentStoppedJudgment,
	);
	it(
		"retains saved checkpoint evidence when its corpus judgment fails",
		checkpointJudgmentFailure,
	);
	it(
		"retains a stopped stage read manifest when its independent corpus judgment fails",
		stoppedJudgmentFailure,
	);
});

async function checkpointJudgmentFailure(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await Bun.write(join(fixture.runsDirectory, "CLAUDE.md"), "instructions");
	await fixture.corpus.recordReadManifest(
		"discuss",
		recordedReads,
		fixture.stoppedRun,
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const text = await response.text();
	expect(JSON.parse(text)).toMatchObject({
		stages: [
			{
				grade: { letter: "A", state: "available", verdict: "CONTINUE" },
				readManifest: { entries: recordedReads, state: "available" },
				readManifestJudgment: {
					reasons: ["The discuss skill is not installed; searched <path>"],
					state: "unavailable",
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
	expect(text).not.toContain(fixture.runsDirectory);
}

async function stoppedJudgmentFailure(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();
	await Bun.write(join(fixture.runsDirectory, "CLAUDE.md"), "instructions");
	await mergeIntoRecord(
		benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun).stageFile(
			"build",
		),
		{ grade: { grade: "F", verdict: "STOP" }, readManifest: recordedReads },
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const text = await response.text();
	expect(JSON.parse(text)).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				grade: { letter: "F", state: "available", verdict: "STOP" },
				readManifest: { entries: recordedReads, state: "available" },
				readManifestJudgment: {
					reasons: ["The build skill is not installed; searched <path>"],
					state: "unavailable",
				},
				stage: "build",
			},
		],
	});
	expect(text).not.toContain(fixture.runsDirectory);
}

async function absentReadManifest(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const text = await response.text();
	expect(JSON.parse(text)).toMatchObject({
		stages: [
			{
				readManifest: {
					reasons: ["the stage saved no checkpoint"],
					state: "unavailable",
				},
				stage: "discuss",
			},
			{
				readManifest: {
					reasons: ["the stage saved no checkpoint"],
					state: "unavailable",
				},
				stage: "build",
			},
		],
	});
	expect(text).not.toContain("readManifestJudgment");
}

async function independentStoppedJudgment(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await Bun.write(join(fixture.runsDirectory, "CLAUDE.md"), "instructions");
	await Bun.write(
		join(fixture.runsDirectory, "skills/build/SKILL.md"),
		"build skill",
	);
	await fixture.corpus.recordReadManifest(
		"discuss",
		recordedReads,
		fixture.stoppedRun,
	);
	await fixture.corpus.recordStageReadManifest("build", recordedReads);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const text = await response.text();
	expect(JSON.parse(text)).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				readManifest: {
					entries: [{ ...recordedRead, state: "changed" }],
					state: "available",
				},
				stage: "build",
			},
		],
	});
}
