import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { commandOutcome, liftingRefusal } from "./command-refusal-test-probe";
import type { CommandOutcome } from "./command-refusal-test-probe";
import type { AnalysisInvoker } from "./root-cause-analysis";
import { analyzeRun } from "./root-cause-analysis";
import {
	ANSWER,
	FakeAnalysisProvider,
} from "./root-cause-analysis-provider-test-fixtures";
import RecordWriterProbe from "./root-cause-analysis-record-writer-probe";
import StoppableAnalysisCall from "./root-cause-analysis-stop-test-fixture";
import {
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
	snapshot,
} from "./root-cause-analysis-test-environment";
import type { AnalysisStorageExample } from "./root-cause-analysis-test-environment";
import { RUN, runStoppedAtBuild } from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const STARTED_AT = "2026-10-04T12:00:00.000Z";
const ONE_MILLISECOND_LATER = "2026-10-04T12:00:00.001Z";

const ANALYSIS_EXAMPLES_0 = [
	{
		digest: "c9f5ed01b92948cdec94b5995afa3ea31084efff79511c7ef52676fe08a87556",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24,"structured_output":{"rootCause":{"stage":"build","file":"skills/build/SKILL.md","lines":{"start":2,"end":3}},"narrative":"the build skill never asks for a direct run","pairedRerun":"replay build with the run step restored","stages":[{"stage":"shape","role":"not a factor","note":"the card was complete","contribution":"left the grade where it was"},{"stage":"build","role":"root cause","note":"no direct run was recorded","contribution":"cost the observed-result requirement"}]}}',
		name: "recorded analysis with spend",
	},
	{
		digest: "1bc0fccbf81250fabfe3c5c3a2668e7c8882d9dce2a5bfafec0d98fd70abf4c1",
		json: '{"session_id":"analysis-session","structured_output":{"rootCause":{"stage":"build","file":"skills/build/SKILL.md","lines":{"start":2,"end":3}},"narrative":"the build skill never asks for a direct run","pairedRerun":"replay build with the run step restored","stages":[{"stage":"shape","role":"not a factor","note":"the card was complete","contribution":"left the grade where it was"},{"stage":"build","role":"root cause","note":"no direct run was recorded","contribution":"cost the observed-result requirement"}]}}',
		name: "recorded analysis without spend",
	},
	{
		digest: "3ed5228b661bacb4cfc530d57da32ead4ed935f2ce9a0046abb7b9a521970611",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24,"structured_output":{"second":{"__proto__":{"preserved":true}},"first":1}}',
		name: "failed analysis with original payload ownership and order",
	},
	{
		digest: "477fd0e3ffcd097b3c62210ff166469d3003a429af8d57f66c6ce0f0a26851fc",
		json: '{"session_id":"analysis-session","total_cost_usd":0.24}',
		name: "failed analysis without payload",
	},
];
async function retainsStoredAnalysisBytes({
	digest,
	json,
}: AnalysisStorageExample): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const invoke: AnalysisInvoker = async () => await Promise.resolve(json);

	const { file } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(invoke),
	);
	const bytes = await Bun.file(file).text();
	const actual = createHash("sha256").update(bytes).digest("hex");

	expect(actual).toBe(digest);
}

async function keepsTheAnswerWithItsCostDurationAndStartInItsOwnFile(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);

	const { file, record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(new FakeAnalysisProvider().invoke),
	);

	expect(record).toMatchObject({
		capUsd: 1,
		costUsd: 0.24,
		durationMs: 4000,
		model: "sonnet",
		narrative: ANSWER.narrative,
		outcome: "recorded",
		pairedRerun: ANSWER.pairedRerun,
		rootCause: ANSWER.rootCause,
		run: RUN,
		schemaVersion: 2,
		startedAt: "2026-10-04T12:00:00.000Z",
	});
	expect(await Bun.file(file).json()).toEqual(record);
	expect(file).toBe(
		join(directory, "analyses", RUN, "2026-10-04T12-00-00.000Z.json"),
	);
}

async function keepsASecondAnalysisBesideTheFirstAndChangesNothingElse(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const analyses = dependencies(new FakeAnalysisProvider().invoke);

	const first = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		analyses,
	);
	const before = await snapshot(directory);

	const second = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		analyses,
	);

	const after = await snapshot(directory);
	after.delete(second.file.slice(directory.length));

	expect(second.file).not.toBe(first.file);
	expect(after).toEqual(before);
}
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
async function keepsTheStopAsTheRecordOfACallStoppedWhileItRuns(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();

	const analysis = analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		{ ...dependencies(call.invoke), stopOnSignal: call.stopOnSignal },
	);
	await liftingRefusal(async () => {
		await call.stopDuringCall("SIGINT");
	});
	const { file, stopped } = await analysis;

	expect(stopped).toBe(true);
	expect(await Bun.file(file).json()).toMatchObject({
		capUsd: 1,
		outcome: "failed",
		reason:
			"stopped by SIGINT during the paid call; what it spent is unknown, and the call is capped at $1",
		startedAt: STARTED_AT,
	});
}
async function keepsTheOutcomeOfACallThatSettledBeforeTheStop(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();
	const records = new RecordWriterProbe();
	records.runOnceAfterReplace(async () => {
		await call.installed().recordStop("SIGTERM");
	});

	const { file, stopped } = await liftingRefusal(
		async () =>
			await analyzeRun(
				{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
				{
					...dependencies(new FakeAnalysisProvider().invoke),
					records,
					stopOnSignal: call.stopOnSignal,
				},
			),
	);

	expect(stopped).toBe(false);
	expect(await Bun.file(file).json()).toMatchObject({
		costUsd: 0.24,
		outcome: "recorded",
	});
}
async function refusesTheCommandsOfACallWhoseStopBeganBeforeItSpawned(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const call = new StoppableAnalysisCall();
	const outcomes: CommandOutcome[] = [];
	const invoke: AnalysisInvoker = async () => {
		await call.installed().recordStop("SIGINT");
		outcomes.push(await commandOutcome());

		return await Promise.reject(new Error("The call was refused"));
	};

	await liftingRefusal(
		async () =>
			await analyzeRun(
				{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
				{ ...dependencies(invoke), stopOnSignal: call.stopOnSignal },
			),
	);

	expect(outcomes).toEqual(["refused"]);
}
describe(analyzeRun.name, () => {
	it.each(ANALYSIS_EXAMPLES_0)(
		"retains historical saved bytes for $name",
		retainsStoredAnalysisBytes,
	);
	it(
		"keeps the answer with its cost, duration and start in its own file",
		keepsTheAnswerWithItsCostDurationAndStartInItsOwnFile,
	);
	it(
		"keeps a second analysis beside the first and changes nothing else",
		keepsASecondAnalysisBesideTheFirstAndChangesNothingElse,
	);
	it(
		"names a second analysis that starts in the same millisecond one millisecond later",
		namesASecondAnalysisInTheSameMillisecondOneMillisecondLater,
	);
	describe("when a stop arrives during the call", () => {
		it(
			"keeps the stop as the call's record",
			keepsTheStopAsTheRecordOfACallStoppedWhileItRuns,
		);
	});
	describe("when a stop arrives before the call spawns", () => {
		it(
			"refuses the call's commands",
			refusesTheCommandsOfACallWhoseStopBeganBeforeItSpawned,
		);
	});
	describe("when a stop arrives after the call settled", () => {
		it(
			"keeps the call's outcome with its cost",
			keepsTheOutcomeOfACallThatSettledBeforeTheStop,
		);
	});
});
