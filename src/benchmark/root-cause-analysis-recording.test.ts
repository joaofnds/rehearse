import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { AnalysisResult } from "./root-cause-analysis";
import { analyzeRun, readRootCauseAnalyses } from "./root-cause-analysis";
import { FakeAnalysisProvider } from "./root-cause-analysis-provider-test-fixtures";
import RecordWriterProbe from "./root-cause-analysis-record-writer-probe";
import {
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
} from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";
import UnrecordedAnalysisError from "./unrecorded-analysis-error";

registerAnalysisFixtureCleanup();

const STARTED_AT = "2026-10-04T12:00:00.000Z";
const ONE_MILLISECOND_LATER = "2026-10-04T12:00:00.001Z";

async function namesASecondAnalysisInTheSameMillisecondOneMillisecondLater(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const sameInstant = {
		...dependencies(new FakeAnalysisProvider().invoke),
		now: () => new Date(STARTED_AT),
	};
	const request = {
		capUsd: 1,
		model: "sonnet",
		run: RUN,
		runsDirectory: directory,
	};

	const first = await analyzeRun(request, sameInstant);
	const second = await analyzeRun(request, sameInstant);

	expect([first.record.startedAt, second.record.startedAt]).toEqual([
		STARTED_AT,
		ONE_MILLISECOND_LATER,
	]);
	expect(await Bun.file(second.file).json()).toEqual(second.record);
	expect(second.file).toBe(
		join(directory, "analyses", RUN, "2026-10-04T12-00-00.001Z.json"),
	);
}
async function failureOf(analysis: Promise<AnalysisResult>): Promise<Error> {
	try {
		await analysis;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}

	throw new Error("Expected the analysis to fail");
}

async function analysisWhoseOutcomeCannotBeWritten(): Promise<{
	readonly directory: string;
	readonly analysis: Promise<AnalysisResult>;
}> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const records = new RecordWriterProbe();
	records.failReplace("The disk is full");

	return {
		analysis: analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{ ...dependencies(new FakeAnalysisProvider().invoke), records },
		),
		directory,
	};
}

async function keepsTheProvisionalRecordWhenTheOutcomeCannotBeWritten(): Promise<void> {
	const { directory, analysis } = await analysisWhoseOutcomeCannotBeWritten();
	await failureOf(analysis);

	const { records } = await readRootCauseAnalyses({
		run: RUN,
		runsDirectory: directory,
	});

	expect(records).toEqual([
		expect.objectContaining({
			durationMs: 0,
			outcome: "failed",
			startedAt: STARTED_AT,
		}),
	]);
}

async function reportsTheOutcomeWithItsCostWhenItCannotBeWritten(): Promise<void> {
	const { analysis } = await analysisWhoseOutcomeCannotBeWritten();

	const failure = await failureOf(analysis);

	expect(failure).toBeInstanceOf(UnrecordedAnalysisError);
	expect(failure).toMatchObject({
		record: { costUsd: 0.24, outcome: "recorded" },
	});
}
const NAMES_ONE_START_CAN_TAKE = 10;

interface ClaimRefusal {
	readonly name: string;
	readonly writer: (directory: string) => Promise<RecordWriterProbe>;
}

async function analysesHoldingEveryNameFromOneStart(
	directory: string,
): Promise<RecordWriterProbe> {
	const request = {
		capUsd: 1,
		model: "sonnet",
		run: RUN,
		runsDirectory: directory,
	};
	await Array.fromAsync({ length: NAMES_ONE_START_CAN_TAKE }, async () => {
		await analyzeRun(request, {
			...dependencies(new FakeAnalysisProvider().invoke),
			now: () => new Date(STARTED_AT),
		});
	});

	return await Promise.resolve(new RecordWriterProbe());
}

async function aWriterThatCannotClaim(): Promise<RecordWriterProbe> {
	const records = new RecordWriterProbe();
	records.failClaim("The disk is full");

	return await Promise.resolve(records);
}

const CLAIM_REFUSALS = [
	{
		name: "other analyses hold every name its start can take",
		writer: analysesHoldingEveryNameFromOneStart,
	},
	{ name: "its record cannot be written", writer: aWriterThatCannotClaim },
];

async function spendsNothingWhenItsRecordCannotBeClaimed({
	writer,
}: ClaimRefusal): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const records = await writer(directory);
	const provider = new FakeAnalysisProvider();
	const progress: string[] = [];

	await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{
				...dependencies(provider.invoke),
				now: () => new Date(STARTED_AT),
				progress: (message) => {
					progress.push(message);
				},
				records,
			},
		),
	);

	expect({ progress, prompts: provider.prompts }).toEqual({
		progress: [],
		prompts: [],
	});
}
describe(analyzeRun.name, () => {
	it(
		"names a second analysis that starts in the same millisecond one millisecond later",
		namesASecondAnalysisInTheSameMillisecondOneMillisecondLater,
	);
	describe("when its record cannot be claimed", () => {
		it.each(CLAIM_REFUSALS)(
			"makes no call and states no spend when $name",
			spendsNothingWhenItsRecordCannotBeClaimed,
		);
	});
	describe("when the outcome cannot be written", () => {
		it(
			"keeps the provisional record",
			keepsTheProvisionalRecordWhenTheOutcomeCannotBeWritten,
		);
		it(
			"reports the outcome with its cost",
			reportsTheOutcomeWithItsCostWhenItCannotBeWritten,
		);
	});
});
