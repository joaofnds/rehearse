import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ReplayRequest } from "./replay";
import { executeReplayStage } from "./replay-command";
import type { ReplayConfirmationRequest } from "./replay-confirmation";
import { benchmarkRunPaths } from "./run-layout";
import { PROJECT_ROOT } from "./test-support";

describe(executeReplayStage.name, () => {
	it('runs one debug replay with the exact "single-rep evidence, not a score" label', async () => {
		const output: string[] = [];
		const requests: ReplayRequest[] = [];
		const replayRequest: ReplayRequest = {
			paths: benchmarkRunPaths("/runs", "run"),
			stage: "build",
			instructions: "instructions",
			corpusSource: { kind: "directory", root: "/corpus" },
			controlSha: "control-sha",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		};

		const outcome = await executeReplayStage(
			{ confirmation: undefined },
			replayRequest,
			{
				approval: {
					output: (message) => {
						output.push(message);
					},
					prompt: () => Promise.resolve("no"),
				},
				runDebug: (request) => {
					requests.push(request);

					return Promise.resolve({ judge: "B" });
				},
				runConfirmed: () => {
					throw new Error("confirmation must not run");
				},
				groupId: () => "confirmation-1",
				corpusRoots: [{ kind: "directory", root: "/corpus" }],
			},
		);

		expect(output).toEqual(["single-rep evidence, not a score"]);
		expect(requests).toEqual([replayRequest]);
		expect(outcome).toEqual({ kind: "debug", evidence: { judge: "B" } });
	});

	it("gets projected-cost approval before starting three confirmation reps", async () => {
		const approval = Promise.withResolvers<string>();
		const events: string[] = [];
		const confirmations: ReplayConfirmationRequest[] = [];
		const replayRequest: ReplayRequest = {
			paths: benchmarkRunPaths("/runs", "run"),
			stage: "build",
			instructions: "instructions",
			corpusSource: { kind: "directory", root: "/corpus" },
			controlSha: "control-sha",
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
		};
		const execution = executeReplayStage(
			{ confirmation: { reps: 3, approved: false } },
			replayRequest,
			{
				approval: {
					output: (message) => {
						events.push(`output:${message}`);
					},
					prompt: (message) => {
						events.push(`prompt:${message}`);

						return approval.promise;
					},
				},
				runDebug: () => {
					throw new Error("debug must not run");
				},
				runConfirmed: (request) => {
					confirmations.push(request);
					events.push(`start:${request.reps}`);

					return Promise.resolve({ group: request.groupId });
				},
				groupId: () => "confirmation-1",
				corpusRoots: [{ kind: "directory", root: "/corpus" }],
			},
		);

		await Promise.resolve();
		expect(confirmations).toEqual([]);
		expect(events).toEqual([
			"output:Projected budget: $60.00 (3 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt:Start confirmation? [y/N] ",
		]);
		approval.resolve("yes");

		expect(await execution).toEqual({
			kind: "confirmation",
			evidence: { group: "confirmation-1" },
		});
		expect(events).toEqual([
			"output:Projected budget: $60.00 (3 reps x $20.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt:Start confirmation? [y/N] ",
			"start:3",
		]);
		expect(confirmations).toEqual([
			{
				...replayRequest,
				groupId: "confirmation-1",
				reps: 3,
				corpusRoots: [{ kind: "directory", root: "/corpus" }],
				projectedCost: {
					reps: 3,
					perRepMaximumUsd: 20,
					totalMaximumUsd: 60,
				},
				approvalMethod: "interactive",
			},
		]);
	});

	/**
	 * The self-preference warning needs the resolved configuration, which now
	 * needs the replayed run's manifest to read what its case declares. A run
	 * that does not exist therefore refuses before the warning can be computed,
	 * and it refuses without reaching a provider, which is the guarantee worth
	 * pinning here. What the warning says when it does print is covered where
	 * judgeSelfPreferenceWarning itself is tested.
	 */
	it("refuses a replay of an unrecorded run before resolving a Judge", async () => {
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
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);

		expect(exitCode).not.toBe(0);
		expect(stderr).toContain(`No replayable run named ${missingRun}`);
		expect(stderr.match(/Self-preference warning/gu)).toBeNull();
	});
});
