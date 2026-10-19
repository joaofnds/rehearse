import { describe, expect, it } from "bun:test";

import { readRootCauseAnalyses } from "./root-cause-analysis";
import {
	FIRST_RECORDED_STAGE_INDEX,
	SECOND_RECORDED_STAGE_INDEX,
	registerAnalysisFixtureCleanup,
	runsDirectory,
	writeAnalysisFile,
} from "./root-cause-analysis-test-environment";
import { RUN } from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const VERSION_ONE_RECORD = {
	bundleBytes: 187_449,
	bundleDigest:
		"ea4dac10a1fcc7e4e8f42c1a2ebb1dd40ff480508d0971c67ea8c37360e90995",
	capUsd: 1,
	costUsd: 0.284394,
	culprit: null,
	durationMs: 9810,
	model: "sonnet",
	narrative: "No corpus file explains the outcome.",
	outcome: "recorded",
	pairedRerun: "Rerun build with the location stated in the task.",
	run: RUN,
	schemaVersion: 1,
	stages: [
		{
			contribution: "no effect on the location failure",
			note: "Shape never chose a directory.",
			role: "not implicated",
			stage: "shape",
		},
		{
			contribution: "placed code at a path the rubric rejected",
			note: "No corpus file build read names a directory.",
			role: "not implicated",
			stage: "build",
		},
	],
	startedAt: "2026-10-04T13:12:13.567Z",
};

async function readsItAtTheCurrentVersionItsStagesUnderTheNewRoleNames(): Promise<void> {
	const directory = await runsDirectory();
	await writeAnalysisFile(directory, JSON.stringify(VERSION_ONE_RECORD));

	const reading = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});

	expect(reading).toEqual({
		records: [
			{
				bundleBytes: 187_449,
				bundleDigest: VERSION_ONE_RECORD.bundleDigest,
				capUsd: 1,
				costUsd: 0.284394,
				durationMs: 9810,
				model: "sonnet",
				narrative: VERSION_ONE_RECORD.narrative,
				outcome: "recorded",
				pairedRerun: VERSION_ONE_RECORD.pairedRerun,
				rootCause: null,
				run: RUN,
				schemaVersion: 2,
				stages: [
					{
						contribution: "no effect on the location failure",
						note: "Shape never chose a directory.",
						role: "not a factor",
						stage: "shape",
					},
					{
						contribution: "placed code at a path the rubric rejected",
						note: "No corpus file build read names a directory.",
						role: "not a factor",
						stage: "build",
					},
				],
				startedAt: "2026-10-04T13:12:13.567Z",
			},
		],
		unreadable: [],
	});
}

async function readsItsCulpritAsTheRootCauseAndEachOldRoleAsItsNewName(): Promise<void> {
	const directory = await runsDirectory();
	const culprit = {
		file: "CLAUDE.md",
		lines: { end: 5, start: 3 },
		stage: "build",
	};
	await writeAnalysisFile(
		directory,
		JSON.stringify({
			...VERSION_ONE_RECORD,
			culprit,
			stages: [
				{
					...VERSION_ONE_RECORD.stages[FIRST_RECORDED_STAGE_INDEX],
					role: "contributing",
				},
				{
					...VERSION_ONE_RECORD.stages[SECOND_RECORDED_STAGE_INDEX],
					role: "primary culprit",
				},
				{ role: "never ran", stage: "verify" },
			],
		}),
	);

	const { records } = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});

	expect(records).toMatchObject([
		{
			rootCause: culprit,
			stages: [
				{ role: "contributing factor", stage: "shape" },
				{ role: "root cause", stage: "build" },
				{ role: "never ran", stage: "verify" },
			],
		},
	]);
}

async function readsAFailedRecordAsItWasWrittenAtTheCurrentVersion(): Promise<void> {
	const directory = await runsDirectory();
	const failed = {
		bundleBytes: 187_449,
		bundleDigest: VERSION_ONE_RECORD.bundleDigest,
		capUsd: 1,
		durationMs: 9810,
		model: "sonnet",
		outcome: "failed",
		reason: "The analysis call failed with no message",
		run: RUN,
		schemaVersion: 1,
		startedAt: "2026-10-04T13:12:13.567Z",
	} as const;
	await writeAnalysisFile(directory, JSON.stringify(failed));

	const reading = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});

	expect(reading).toEqual({
		records: [{ ...failed, schemaVersion: 2 }],
		unreadable: [],
	});
}
describe(readRootCauseAnalyses.name, () => {
	describe("when a record predates the rename to root-cause analysis", () => {
		it(
			"reads it at the current version, its stages under the new role names",
			readsItAtTheCurrentVersionItsStagesUnderTheNewRoleNames,
		);
		it(
			"reads its culprit as the root cause and each old role as its new name",
			readsItsCulpritAsTheRootCauseAndEachOldRoleAsItsNewName,
		);
		it(
			"reads a failed record as it was written, at the current version",
			readsAFailedRecordAsItWasWrittenAtTheCurrentVersion,
		);
	});
});
