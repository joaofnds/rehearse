import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import writeComparisonReport from "./comparison-command";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import { recordedSessionRep } from "./session-comparison-record-reader-fixture";
import { readSingleCaseSessionReport } from "./session-comparison-report-reader-fixture";
import { resources } from "./session-confirmation-workspace-test-fixtures";
import { sessionJudgeComparison } from "./session-quality-test-fixtures";
import { parseSessionAttemptRecord } from "./session-record";

resources.registerCleanup();
const CHECKS_OUTCOME_INDEX = 0;
const FIRST_REP_INDEX = 0;
const SINGLE_REP_COUNT = 1;
const SHA256_HEX_CHARACTERS = 64;
const TOTAL_ATTEMPT_COST_USD = 0.06;

async function preservesJudgeFailureAndCost(): Promise<void> {
	const request = await sessionJudgeComparison();

	const reportFile = await writeComparisonReport(request);
	const report = await readSingleCaseSessionReport(reportFile);
	const [benchmarkCase] = report.cases;

	expect(
		benchmarkCase?.arms.baseline.source.reps.map((rep) => rep.judge),
	).toEqual([
		{ status: "GRADED", verdict: "FAIL" },
		{ status: "GRADED", verdict: "FAIL" },
	]);
	expect(
		benchmarkCase?.arms.baseline.source.reps.map(
			(rep) => rep.outcomes[CHECKS_OUTCOME_INDEX],
		),
	).toEqual([
		{ grade: "A", name: "checks", status: "JUDGED", successful: true },
		{ grade: "A", name: "checks", status: "JUDGED", successful: true },
	]);
	expect(benchmarkCase?.arms.baseline.resources).toMatchObject({
		status: "AVAILABLE",
		total: {
			costUsd: {
				mean: TOTAL_ATTEMPT_COST_USD,
				values: [TOTAL_ATTEMPT_COST_USD, TOTAL_ATTEMPT_COST_USD],
			},
		},
	});
}

async function refusesUnfrozenRubric(): Promise<void> {
	const request = await sessionJudgeComparison();
	const groupFile = join(
		request.runsDirectory,
		"confirmations",
		"judged-baseline",
		"group.json",
	);
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	await Bun.write(
		groupFile,
		JSON.stringify({
			...group,
			inputs: {
				...group.inputs,
				files: group.inputs.files.filter((file) => file.kind !== "rubric"),
			},
		}),
	);

	const error = await failureOf(writeComparisonReport(request));
	expect(error.message).toContain(
		"a declared session Judge requires exactly one frozen rubric",
	);
}

describe(writeComparisonReport.name, () => {
	it(
		"preserves quality failures alongside passing checks and charges the Judge calls",
		preservesJudgeFailureAndCost,
	);
	it(
		"refuses a declared Judge whose rubric was not frozen",
		refusesUnfrozenRubric,
	);
});

async function changeCandidateContract(
	request: Awaited<ReturnType<typeof sessionJudgeComparison>>,
	everyRep: boolean,
): Promise<void> {
	const groupFile = join(
		request.runsDirectory,
		"confirmations",
		"judged-candidate",
		"group.json",
	);
	const group = parseConfirmationGroupRecord(await Bun.file(groupFile).text());
	const references = everyRep
		? group.repRecords
		: group.repRecords.slice(FIRST_REP_INDEX, SINGLE_REP_COUNT);
	await Array.fromAsync(references, async (reference) => {
		const rep = await recordedSessionRep({ groupFile, reference });
		const record = parseSessionAttemptRecord(
			await Bun.file(rep.attemptPath).text(),
		);
		if (record.judge === undefined) {
			throw new Error("Expected fixture Judge");
		}
		await Bun.write(
			rep.attemptPath,
			JSON.stringify({
				...record,
				judge: {
					...record.judge,
					judgeContractSha256: "b".repeat(SHA256_HEX_CHARACTERS),
				},
			}),
		);
	});
}

async function rejectsDifferentContract(everyRep: boolean): Promise<void> {
	const request = await sessionJudgeComparison();
	await changeCandidateContract(request, everyRep);

	const error = await failureOf(writeComparisonReport(request));

	expect(error.message).toContain("judgeContractSha256");
}

describe("session Judge contract comparisons", () => {
	it.each([true, false])(
		"refuses distinct Judge contracts (every candidate rep: %s)",
		rejectsDifferentContract,
	);
});
