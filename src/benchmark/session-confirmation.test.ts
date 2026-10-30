import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CommandError } from "./command";
import { runSessionAttempt } from "./session-attempt";
import { runSessionConfirmation } from "./session-confirmation";
import confirmationEvidence from "./session-confirmation-evidence-test-fixtures";
import {
	frozenSessionScenario,
	outcomeSessionScenario,
} from "./session-confirmation-provider-test-fixtures";
import {
	DISTINCT_CONFIRMATION_INPUT_COUNT,
	FIRST_RECORDED_CHECK_INDEX,
	FIRST_RECORDED_STAGE_INDEX,
	FIRST_REP_ORDINAL,
	PREFIX_START_INDEX,
	RETAINED_CONFIRMATION_REP_COUNT,
	SECOND_REP_ORDINAL,
	THIRD_REP_ORDINAL,
	confirmationRequest,
	simpleSessionCase,
} from "./session-confirmation-test-fixtures";
import {
	budgetSessionWorkspace,
	resources,
} from "./session-confirmation-workspace-test-fixtures";
import ABSENT_HOME from "./session-setup-test-fixtures";

resources.registerCleanup();

async function runsEveryRepFromOneFrozenInputSet(): Promise<void> {
	const scenario = await frozenSessionScenario();

	await runSessionConfirmation(scenario.dependencies, scenario.request);
	const { observedInputs, completed } = scenario.provider;
	const expectedObservedInputCount = 3;

	expect(observedInputs).toHaveLength(expectedObservedInputCount);
	expect(new Set(observedInputs)).toHaveLength(
		DISTINCT_CONFIRMATION_INPUT_COUNT,
	);
	const [observedFirstObservedInput] = observedInputs;
	expect(observedFirstObservedInput).toContain(
		"original fixture\n|original transcript\n|original corpus\n",
	);
	expect(completed.toSorted((left, right) => left - right)).toEqual([
		FIRST_REP_ORDINAL,
		THIRD_REP_ORDINAL,
	]);
}

async function recordsAProviderFailureAmongHealthyReps(): Promise<void> {
	const scenario = await frozenSessionScenario();

	const outcome = await runSessionConfirmation(
		scenario.dependencies,
		scenario.request,
	);
	const { group, reps } = await confirmationEvidence(outcome);

	expect(group.repRecords.map(({ ordinal }) => ordinal)).toEqual([
		FIRST_REP_ORDINAL,
		SECOND_REP_ORDINAL,
		THIRD_REP_ORDINAL,
	]);
	expect(reps.map(({ outcome: repOutcome }) => repOutcome)).toEqual([
		"SUCCESSFUL",
		"UNSUCCESSFUL",
		"SUCCESSFUL",
	]);
	const [, observedSecondRep] = reps;
	expect(observedSecondRep?.stages[FIRST_RECORDED_STAGE_INDEX]?.status).toBe(
		"EXECUTION_FAILED",
	);
}

async function preservesAttemptFailureAndKeepsPrivatePathsOutOfRepRecords(): Promise<void> {
	const scenario = await frozenSessionScenario();

	const outcome = await runSessionConfirmation(
		scenario.dependencies,
		scenario.request,
	);
	const { attempts, reps } = await confirmationEvidence(outcome);
	const [observedFirstRep] = reps;

	expect(observedFirstRep).not.toHaveProperty("attemptDirectory");
	expect(observedFirstRep).not.toHaveProperty("worktreePath");
	const [, failedAttempt] = attempts;
	expect(failedAttempt).toMatchObject({
		error: "provider rejected rep 2",
		outcome: "EXECUTION_FAILED",
	});
}

async function mapsPassFailedChecksNoReplyAndProviderFailureWithoutDroppingNamedEvidence(): Promise<void> {
	const scenario = await outcomeSessionScenario();

	const outcome = await runSessionConfirmation(
		scenario.dependencies,
		scenario.request,
	);
	const { reps, attempts, report } = await confirmationEvidence(outcome);

	expect(
		reps.map((rep) => rep.stages[FIRST_RECORDED_STAGE_INDEX]?.status),
	).toEqual([
		"JUDGED",
		"JUDGED",
		"NOT_REACHED",
		"METRICS_MISSING",
		"EXECUTION_FAILED",
	]);
	expect(
		reps
			.slice(PREFIX_START_INDEX, RETAINED_CONFIRMATION_REP_COUNT)
			.map((rep) => rep.stages[FIRST_RECORDED_STAGE_INDEX]),
	).toMatchObject([
		{ grade: "A", verdict: "CONTINUE" },
		{ grade: "F", verdict: "STOP" },
	]);
	const [observedFirstAttempt, observedSecondAttempt] = attempts;
	expect(observedFirstAttempt?.checks[FIRST_RECORDED_CHECK_INDEX]?.detail).toBe(
		"named pass",
	);
	expect(
		observedSecondAttempt?.checks[FIRST_RECORDED_CHECK_INDEX]?.detail,
	).toBe("named failure");
	expect(report.resources.commandTotal).toEqual({
		missing: ["preflight call metrics", "1 rep call metrics"],
		status: "MISSING",
	});
}

async function recordsABudgetHaltedRepSStatedErrorAndCostOnItsStageAndAttempt(): Promise<void> {
	const { root, corpusRoot, projectsDirectory, halt } =
		await budgetSessionWorkspace();

	const outcome = await runSessionConfirmation(
		{
			executeAttempt: async (plan) =>
				await runSessionAttempt({
					corpusSnapshot: plan.corpusSnapshot,
					environment: {},
					home: ABSENT_HOME,
					projectsDirectory,
					recordDirectory: plan.recordDirectory,
					runClaude: (command) => {
						throw new CommandError(command, {
							exitCode: 1,
							stderr: "",
							stdout: halt,
						});
					},
					sessionCase: plan.sessionCase,
					settings: plan.settings,
				}),
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "halt-group",
			preflight: { missing: "preflight call metrics", status: "MISSING" },
			runsDirectory: join(root, "runs"),
			sessionCase: simpleSessionCase(),
		}),
	);
	const { reps, attempts } = await confirmationEvidence(outcome);
	const [rep] = reps;
	const [observedFirstStage] = rep?.stages ?? [];

	expect(observedFirstStage).toMatchObject({
		error: "Reached maximum budget ($0.2853308) (spent $0.5782854)",
		status: "EXECUTION_FAILED",
	});
	const [attempt] = attempts;
	expect(attempt).toMatchObject({
		error: "Reached maximum budget ($0.2853308) (spent $0.5782854)",
	});
}

describe(runSessionConfirmation.name, () => {
	it(
		"runs every rep from one frozen input set",
		runsEveryRepFromOneFrozenInputSet,
	);
	it(
		"records a provider failure among healthy reps",
		recordsAProviderFailureAmongHealthyReps,
	);
	it(
		"preserves attempt failure and keeps private paths out of rep records",
		preservesAttemptFailureAndKeepsPrivatePathsOutOfRepRecords,
	);
	it(
		"maps pass, failed checks, no reply, and provider failure without dropping named evidence",
		mapsPassFailedChecksNoReplyAndProviderFailureWithoutDroppingNamedEvidence,
	);
	it(
		"records a budget-halted rep's stated error and cost on its stage and attempt",
		recordsABudgetHaltedRepSStatedErrorAndCostOnItsStageAndAttempt,
	);
});
