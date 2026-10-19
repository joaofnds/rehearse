import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import { runCalibrate } from "#cli/calibrate-command";
import {
	RUN_NAME,
	writeReview,
	writeRunFixture,
} from "#cli/calibrate-test-support";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";

import {
	CalibrateRequestBuilder,
	PROVIDER_CALL_COUNT_INCREMENT,
	passingProbe,
	rejudgingStage,
	storedCeiling,
	unavailableCalibrationJudges,
	unchangedControlSources,
} from "./calibration-command-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

async function rejectsAnEscapingRevisedInstructionBeforeRejudging(): Promise<void> {
	const expectedProviderCalls = 0;

	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	let providerCalls = 0;

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				readCurrentSources: async () =>
					await Promise.reject(
						new SymlinkedEntryError(
							"Corpus file CLAUDE.md resolves outside the live corpus extent",
						),
					),
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: () => {
					providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
					return unavailableCalibrationJudges({
						final: "no final rejudge",
						stage: "no stage rejudge",
					});
				},
				output: recordOutput().output,
				probeModel: async () => {
					providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
					await Promise.resolve();
				},
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("CLAUDE.md");
	expect(providerCalls).toBe(expectedProviderCalls);
}

async function refusesARejudgeWithoutAStoredSpendCeilingBefore(): Promise<void> {
	const expectedProviderCalls = 0;

	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	let providerCalls = 0;

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: () => {
					providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
					return unavailableCalibrationJudges({
						final: "no final rejudge",
						stage: "no stage rejudge",
					});
				},
				output: recordOutput().output,
				probeModel: async () => {
					providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
					await Promise.resolve();
				},
				requireSpendCeiling: async () =>
					await Promise.reject(
						new RefusedPreconditionError("No spend ceiling"),
					),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(providerCalls).toBe(expectedProviderCalls);
}

async function haltsBeforeRejudgingWhenTheRecordedJudgeModelIs(): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	const { output } = recordOutput();
	const built: unknown[] = [];

	const failure = await failureOf(
		runCalibrate(
			new CalibrateRequestBuilder({
				runsDirectory: fixture.runsDirectory,
			}).build(),
			{
				buildJudges: (knobs) => {
					built.push(knobs);

					return unavailableCalibrationJudges({
						final: "no provider call",
						stage: "no provider call",
					});
				},
				output,
				probeModel: async () => {
					await Promise.reject(
						new RefusedPreconditionError("Model sonnet is not available"),
					);
				},
				requireSpendCeiling: storedCeiling,
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(built).toEqual([]);
}

async function rejectsWithHistoricalCalibrationDiagnostic({
	digest,
	domain,
	json,
}: CalibrationDiagnosticScenario): Promise<void> {
	const fixture = await writeRunFixture(workspace);

	await writeReview(fixture.reviewFile, []);
	const file =
		domain === "artifact" ? fixture.artifactFile : fixture.reviewFile;
	await Bun.write(file, json);

	const failure = await failureOf(
		runCalibrate(
			{
				confirmRejudge: false,
				id: RUN_NAME,
				json: false,
				readCurrentSources: unchangedControlSources,
				runsDirectory: fixture.runsDirectory,
			},
			{
				buildJudges: rejudgingStage(),
				output: recordOutput().output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
			},
		),
	);
	const actual = createHash("sha256").update(failure.message).digest("hex");

	expect(failure).toBeInstanceOf(UsageError);
	expect(actual).toBe(digest);
}

interface CalibrationDiagnosticScenario {
	readonly digest: string;
	readonly domain: "artifact" | "review";
	readonly json: string;
	readonly name: string;
}

const preservesPublicDiagnosticBytesForNameExamples: CalibrationDiagnosticScenario[] =
	[
		{
			digest:
				"13d9212ef7346cc5a3a75bfdb7e6b60c72ef338a014c1468e6efd5d85a35e290",
			domain: "artifact",
			json: "{}",
			name: "artifact root",
		},
		{
			digest:
				"82e9a37b043221ea2f25958f0be617031444057cf58089f8e605729839841ee8",
			domain: "artifact",
			json: '{"judgeModel":"sonnet","status":"AWAITING_HUMAN_REVIEW","caseId":"probe","sourceRoot":"source","resultSha":"sha","instructions":"text","rubric":"rubric","grade":{"requirements":[{"evidence":[{}]},{"id":1}],"verdict":1,"summary":1},"baselineContext":[{}],"diff":"","changedPaths":[],"checkIntegrity":{},"localChecks":{},"stageScorecards":[],"reviewFile":"review"}',
			name: "artifact nested grade and evidence",
		},
		{
			digest:
				"810d83e0d3bc7b3beacfc15622b963ad7116de394694f9d920293e668a8258ea",
			domain: "artifact",
			json: '{"judgeModel":"sonnet","status":"AWAITING_HUMAN_REVIEW","caseId":"probe","sourceRoot":"source","resultSha":"sha","instructions":"text","rubric":"rubric","grade":{"requirements":[],"verdict":"PASS","summary":"good"},"baselineContext":[],"diff":"","changedPaths":[],"checkIntegrity":{"status":"PASS","evidence":[]},"localChecks":{"status":"PASS","evidence":[]},"stageScorecards":[{"stage":"build","rubricPath":"rubric","rubric":{"hardBlockers":[],"requirements":[],"dimensions":[]},"input":{},"prompt":"prompt","attempts":[{"costUsd":0,"metrics":{"costUsd":0,"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"turns":1,"modelUsage":{"sonnet":{}}},"outcome":"ACCEPTED"}],"costUsd":0,"grade":{}}],"reviewFile":"review"}',
			name: "artifact scorecard nested metrics record values",
		},
		{
			digest:
				"3d82e21b0b6e00157a2f747a6577af07e750500ceb677ad2bfaffd10580e15fc",
			domain: "artifact",
			json: '{"judgeModel":"sonnet","status":"AWAITING_HUMAN_REVIEW","caseId":"probe","sourceRoot":"source","resultSha":"sha","instructions":"text","rubric":"rubric","grade":{"requirements":[],"verdict":"PASS","summary":"good"},"baselineContext":[],"diff":"","changedPaths":[],"checkIntegrity":{"status":"PASS","evidence":[]},"localChecks":{"status":"PASS","evidence":[]},"stageScorecards":[{"stage":"build","rubricPath":"rubric","rubric":{},"input":{},"prompt":"prompt","attempts":[{}],"costUsd":0,"grade":{}}],"reviewFile":"review"}',
			name: "artifact nested rejected outcome union",
		},
		{
			digest:
				"35cf9c20df8ae7a427f53a270652469370f0089d1989fde3de02f5baf3819bfc",
			domain: "review",
			json: "{}",
			name: "review root",
		},
		{
			digest:
				"4291506d8badbc5b3ad07f014a70f17f3d590b23ec928146fbf4f997acfd125f",
			domain: "review",
			json: '{"verdict":"ACCEPT","summary":"summary","findings":[{}]}',
			name: "review findings",
		},
	];

describe(runCalibrate.name, () => {
	describe("when the saved artifact or review is invalid", () => {
		it.each(preservesPublicDiagnosticBytesForNameExamples)(
			"preserves public diagnostic bytes for $name",
			rejectsWithHistoricalCalibrationDiagnostic,
		);
	});

	describe("when revised instructions escape the live corpus", () => {
		it(
			"rejects an escaping revised instruction before rejudging",
			rejectsAnEscapingRevisedInstructionBeforeRejudging,
		);
	});

	describe("when no spend ceiling is stored", () => {
		it(
			"refuses a rejudge without a stored spend ceiling before any provider call",
			refusesARejudgeWithoutAStoredSpendCeilingBefore,
		);
	});

	describe("when the recorded Judge model is unavailable", () => {
		it(
			"halts before rejudging when the recorded Judge model is not available",
			haltsBeforeRejudgingWhenTheRecordedJudgeModelIs,
		);
	});
});
