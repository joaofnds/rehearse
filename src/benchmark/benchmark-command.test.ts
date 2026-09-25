import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeBenchmark } from "./benchmark-command";
import { PROJECT_ROOT } from "./test-support";

describe(executeBenchmark.name, () => {
	it("keeps debug evidence single and gates three pipeline reps on approval", async () => {
		const config = {
			caseId: "audit-log",
			sourceDir: "/target",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/test.json",
			pause: false,
		};
		const debugOutput: string[] = [];
		const debug = await executeBenchmark(config, 2, {
			approval: {
				output: (message) => {
					debugOutput.push(message);
				},
				prompt: () => Promise.resolve("no"),
			},
			runDebug: () => Promise.resolve({ judge: "PASS" }),
			runConfirmed: () =>
				Promise.reject(new Error("confirmation must not run")),
		});
		expect(debugOutput).toEqual(["single-rep evidence, not a score"]);
		expect(debug).toEqual({ kind: "debug", evidence: { judge: "PASS" } });

		const approval = Promise.withResolvers<string>();
		const events: string[] = [];
		const confirmations: unknown[] = [];
		const execution = executeBenchmark(
			{ ...config, confirmation: { reps: 3, approved: false } },
			2,
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
				runDebug: () => Promise.reject(new Error("debug must not run")),
				runConfirmed: (request) => {
					confirmations.push(request);
					events.push(`start:${request.reps}`);

					return Promise.resolve({ group: "pipeline-1" });
				},
			},
		);
		await Promise.resolve();
		expect(confirmations).toEqual([]);
		expect(events).toEqual([
			"output:Projected budget: $135.00 (3 reps x $45.00). A session stops only after the call that crosses its budget, so the charge can exceed this.",
			"prompt:Start confirmation? [y/N] ",
		]);
		approval.resolve("yes");
		expect(await execution).toEqual({
			kind: "confirmation",
			evidence: { group: "pipeline-1" },
		});
		expect(confirmations).toEqual([
			{
				reps: 3,
				projectedCost: {
					reps: 3,
					perRepMaximumUsd: 45,
					totalMaximumUsd: 135,
				},
				approvalMethod: "interactive",
			},
		]);
	});

	it("refuses the production CLI before target access when stdin is not a terminal", async () => {
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
				stdin: new Blob([""]),
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);

		expect(exitCode).toBe(3);
		expect(stdout).toBe("");
		expect(stderr).toContain("stdin is not a terminal");
		expect(stderr).not.toContain("Projected budget");
		expect(stderr).not.toContain(missingTarget);
		expect(stderr).not.toContain("Self-preference warning");
	});
});
