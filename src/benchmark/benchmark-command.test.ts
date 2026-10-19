import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import executeBenchmark from "./benchmark-command";
import BenchmarkConfirmationProbe from "./benchmark-confirmation-test-probe";
import BenchmarkRequestBuilder from "./benchmark-request-test-builder";
import { PROJECT_ROOT } from "./test-support";

const BENCHMARK_STAGE_COUNT = 2;

const runsOneDebugBenchmark = async (): Promise<void> => {
	const config = new BenchmarkRequestBuilder().build();
	const debugOutput: string[] = [];

	const debug = await executeBenchmark(config, BENCHMARK_STAGE_COUNT, {
		approval: {
			output: (message) => {
				debugOutput.push(message);
			},
			prompt: async () => await Promise.resolve("no"),
		},
		runConfirmed: async () =>
			await Promise.reject(new Error("confirmation must not run")),
		runDebug: async () => await Promise.resolve({ judge: "PASS" }),
	});

	expect(debugOutput).toEqual(["single-rep evidence, not a score"]);
	expect(debug).toEqual({ evidence: { judge: "PASS" }, kind: "debug" });
};
const gatesConfirmedBenchmarkOnApproval = async (): Promise<void> => {
	const probe = new BenchmarkConfirmationProbe();

	const execution = executeBenchmark(
		new BenchmarkRequestBuilder({
			confirmation: { approval: "interactive", reps: 3 },
		}).build(),
		BENCHMARK_STAGE_COUNT,
		probe.dependencies(),
	);

	expect(probe.confirmations).toEqual([]);
	expect(probe.events).toEqual([
		"output:Projected budget: $135.00 (3 reps x $45.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
		"prompt:Start confirmation? [y/N] ",
	]);
	probe.approval.resolve("yes");
	expect(await execution).toEqual({
		evidence: { group: "pipeline-1" },
		kind: "confirmation",
	});
	expect(probe.confirmations).toEqual([
		{
			approvalMethod: "interactive",
			projectedCost: {
				perRepMaximumUsd: 45,
				reps: 3,
				totalMaximumUsd: 135,
			},
			reps: 3,
		},
	]);
};

const executeBenchmarkRefusesTheProductionCLIBeforeTargetAccessWhenStdinIsNotATerminal =
	async (): Promise<void> => {
		const expectedExitCode = 3;

		const missingTarget = join(tmpdir(), `missing-target-${randomUUID()}`);
		const child = Bun.spawn(
			[
				process.execPath,
				"rehearse.ts",
				"run",
				"--target",
				missingTarget,
				"--model",
				"sonnet",
				"--session-budget-usd",
				"1",
				"--confirm",
			],
			{
				cwd: PROJECT_ROOT,
				env: { ...Bun.env },
				stderr: "pipe",
				stdin: new Blob([""]),
				stdout: "pipe",
			},
		);
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);

		expect(exitCode).toBe(expectedExitCode);
		expect(stdout).toBe("");
		expect(stderr).toContain("stdin is not a terminal");
		expect(stderr).not.toContain("Projected budget");
		expect(stderr).not.toContain(missingTarget);
		expect(stderr).not.toContain("Self-preference warning");
	};

describe(executeBenchmark.name, () => {
	it("keeps debug evidence single", runsOneDebugBenchmark);
	it(
		"gates three pipeline reps on approval",
		gatesConfirmedBenchmarkOnApproval,
	);

	it(
		"refuses the production CLI before target access when stdin is not a terminal",
		executeBenchmarkRefusesTheProductionCLIBeforeTargetAccessWhenStdinIsNotATerminal,
	);
});
