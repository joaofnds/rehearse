import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";

import type { ReplayRequest } from "./replay";
import executeReplayStage from "./replay-command";
import ReplayConfirmationApproval from "./replay-command-test-fixture";
import { ReplayRequestBuilder } from "./replay-test-fixtures";
import { benchmarkRunPaths } from "./run-layout";
import { PROJECT_ROOT } from "./test-support";

const runsOneDebugReplay = async (): Promise<void> => {
	const output: string[] = [];
	const requests: ReplayRequest[] = [];
	const replayRequest: ReplayRequest = {
		controlSha: "control-sha",
		corpusSource: { kind: "directory", root: "/corpus" },
		declaredTargetRoot: undefined,
		instructions: "instructions",
		judgeModel: "opus",
		model: "sonnet",
		paths: benchmarkRunPaths("/runs", "run"),
		sessionBudgetUsd: 5,
		spendCeilingUsd: 100,
		stage: "build",
	};

	const outcome = await executeReplayStage(
		{ confirmation: undefined, stageSkill: "installed" },
		replayRequest,
		{
			approval: {
				output: (message) => {
					output.push(message);
				},
				prompt: async () => await Promise.resolve("no"),
			},
			corpusRoots: [{ kind: "directory", root: "/corpus" }],
			groupId: () => "confirmation-1",
			runConfirmed: () => {
				throw new Error("confirmation must not run");
			},
			runDebug: async (request) => {
				requests.push(request);

				return await Promise.resolve({ judge: "B" });
			},
		},
	);

	expect(output).toEqual(["single-rep evidence, not a score"]);
	expect(requests).toEqual([replayRequest]);
	expect(outcome).toEqual({ evidence: { judge: "B" }, kind: "debug" });
};
const waitsForProjectedCostApproval = async (): Promise<void> => {
	const fake = new ReplayConfirmationApproval();
	const replayRequest = new ReplayRequestBuilder({
		corpusSource: { kind: "directory", root: "/corpus" },
		effort: "high",
		instructions: "instructions",
		judgeEffort: "high",
	}).build(benchmarkRunPaths("/runs", "run"));

	const execution = executeReplayStage(
		{
			confirmation: { approval: "interactive", reps: 3 },
			stageSkill: "installed",
		},
		replayRequest,
		fake.dependencies,
	);

	expect(fake.confirmations).toEqual([]);
	expect(fake.events).toEqual([
		"output:Projected budget: $60.00 (3 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		"prompt:Start confirmation? [y/N] ",
	]);
	fake.approval.resolve("yes");

	expect(await execution).toEqual({
		evidence: { group: "confirmation-1" },
		kind: "confirmation",
	});
	expect(fake.events).toEqual([
		"output:Projected budget: $60.00 (3 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		"prompt:Start confirmation? [y/N] ",
		"start:3",
	]);
	expect(fake.confirmations).toEqual([
		{
			...replayRequest,
			approvalMethod: "interactive",
			corpusRoots: [{ kind: "directory", root: "/corpus" }],
			groupId: "confirmation-1",
			projectedCost: {
				perRepMaximumUsd: 20,
				reps: 3,
				totalMaximumUsd: 60,
			},
			reps: 3,
			stageSkill: "installed",
		},
	]);
};
const refusesAnUnrecordedRun = async (): Promise<void> => {
	const expectedExitCode = 0;

	const missingRun = `missing-run-${randomUUID()}`;
	const child = Bun.spawn(
		[
			process.execPath,
			"rehearse.ts",
			"replay",
			"--run",
			missingRun,
			"--stage",
			"build",
			"--model",
			"sonnet",
			"--judge-model",
			"claude-sonnet-4-6",
			"--session-budget-usd",
			"1",
		],
		{
			cwd: PROJECT_ROOT,
			env: { ...Bun.env },
			stderr: "pipe",
			stdout: "pipe",
		},
	);
	const [exitCode, stderr] = await Promise.all([
		child.exited,
		new Response(child.stderr).text(),
	]);

	expect(exitCode).not.toBe(expectedExitCode);
	expect(stderr).toContain(`No replayable run named ${missingRun}`);
	expect(stderr.match(/Self-preference warning/gu)).toBeNull();
};
describe(executeReplayStage.name, () => {
	it(
		'runs one debug replay with the exact "single-rep evidence, not a score" label',
		runsOneDebugReplay,
	);

	it(
		"gets projected-cost approval before starting three confirmation reps",
		waitsForProjectedCostApproval,
	);

	/**
	 * The self-preference warning needs the resolved configuration, which now
	 * needs the replayed run's manifest to read what its case declares. A run
	 * that does not exist therefore refuses before the warning can be computed,
	 * and it refuses without reaching a provider, which is the guarantee worth
	 * pinning here. What the warning says when it does print is covered where
	 * judgeSelfPreferenceWarning itself is tested.
	 */
	it(
		"refuses a replay of an unrecorded run before resolving a Judge",
		refusesAnUnrecordedRun,
	);
});
