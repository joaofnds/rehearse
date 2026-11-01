import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runSessionConfirmation } from "./session-confirmation";
import confirmationEvidence from "./session-confirmation-evidence-test-fixtures";
import { metrics } from "./session-confirmation-test-fixtures";
import { resources } from "./session-confirmation-workspace-test-fixtures";
import {
	GROUP_JUDGE_RUBRIC,
	failingSessionJudge,
	judgedSessionGroup,
} from "./session-quality-test-fixtures";

const JUDGE_COST_USD = 0.04;
const TOTAL_ATTEMPT_COST_USD = 0.06;
resources.registerCleanup();

async function retainsJudgeFailureAndCost(): Promise<void> {
	const outcome = await judgedSessionGroup();

	const { attempts, reps } = await confirmationEvidence(outcome);
	const report: unknown = await Bun.file(outcome.reportFile).json();

	expect(attempts.map((attempt) => attempt.judge?.status)).toEqual([
		"GRADED",
		"GRADED",
	]);
	expect(reps.map((rep) => rep.metrics.calls.map((call) => call.role))).toEqual(
		[
			["worker", "final-judge"],
			["worker", "final-judge"],
		],
	);
	expect(report).toMatchObject({
		judges: [
			{ repId: "judged-group-rep-1", status: "GRADED", verdict: "FAIL" },
			{ repId: "judged-group-rep-2", status: "GRADED", verdict: "FAIL" },
		],
		outcomeMeaning: "reply/transcript checks only",
		resources: {
			perRole: {
				"final-judge": { costUsd: [JUDGE_COST_USD, JUDGE_COST_USD] },
			},
			total: { costUsd: [TOTAL_ATTEMPT_COST_USD, TOTAL_ATTEMPT_COST_USD] },
		},
	});
}

async function freezesRubric(): Promise<void> {
	const outcome = await judgedSessionGroup();

	const { group } = await confirmationEvidence(outcome);
	const frozenRubric = group.inputs.files.find(
		(file) => file.kind === "rubric",
	);

	expect(
		await Bun.file(
			join(outcome.groupRecordFile, "..", frozenRubric?.path ?? "missing"),
		).text(),
	).toBe(GROUP_JUDGE_RUBRIC);
}

async function retainsWorkerMetricsWithoutJudgeUsage(): Promise<void> {
	const judge = { ...(await failingSessionJudge()), providerCalls: [{}] };

	const outcome = await judgedSessionGroup(judge);
	const { attempts, reps } = await confirmationEvidence(outcome);

	expect(reps.map((rep) => rep.metrics)).toEqual([
		{
			calls: [{ metrics, role: "worker" }],
			missing: ["final-judge call metrics"],
			status: "MISSING",
		},
		{
			calls: [{ metrics, role: "worker" }],
			missing: ["final-judge call metrics"],
			status: "MISSING",
		},
	]);
	expect(attempts.map((attempt) => attempt.judge?.costUsd)).toEqual([
		JUDGE_COST_USD,
		JUDGE_COST_USD,
	]);
}

describe(runSessionConfirmation.name, () => {
	it(
		"retains a failing Judge separately from passing checks and includes its paid call",
		retainsJudgeFailureAndCost,
	);
	it(
		"freezes the declared session rubric as a comparison input",
		freezesRubric,
	);
	it(
		"keeps worker measurements when a paid Judge reports no usage",
		retainsWorkerMetricsWithoutJudgeUsage,
	);
});
