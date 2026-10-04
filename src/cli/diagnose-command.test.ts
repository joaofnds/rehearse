import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeEnvelope } from "#benchmark/contracts";
import type { AnalysisInvoker } from "#benchmark/root-cause-analysis";
import {
	ANSWER,
	answering,
	RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";
import { nothingRunning } from "#benchmark/run-records-test-support";
import type {
	DiagnoseDependencies,
	DiagnoseRequest,
} from "#cli/diagnose-command";
import { runDiagnose } from "#cli/diagnose-command";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import type { OutputRecorder } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function endedRun(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-analyze-"));
	roots.push(root);
	await runStoppedAtBuild(root);

	return root;
}

function answeringWith(
	structuredOutput: ClaudeEnvelope["structured_output"],
): AnalysisInvoker {
	return () => Promise.resolve(JSON.stringify(answering(structuredOutput)));
}

function request(
	runsDirectory: string,
	overrides: Partial<DiagnoseRequest> = {},
): DiagnoseRequest {
	return {
		id: RUN,
		runsDirectory,
		model: "sonnet",
		budgetUsd: undefined,
		json: false,
		...overrides,
	};
}

/** The models the command asked for an invoker under, in order. */
class InvokerRequests {
	public readonly models: string[] = [];
}

function dependencies(
	recorder: OutputRecorder,
	invoke: AnalysisInvoker,
	requests = new InvokerRequests(),
): DiagnoseDependencies {
	const { models } = requests;

	return {
		output: recorder.output,
		invokerFor: (model) => {
			models.push(model);

			return invoke;
		},
		now: () => new Date("2026-10-04T12:00:00.000Z"),
		liveness: nothingRunning,
		requireSpendCeiling: () => Promise.resolve(30),
	};
}

describe(runDiagnose.name, () => {
	it("prints the record it wrote, after stating what the call could spend", async () => {
		const directory = await endedRun();
		const recorder = recordOutput();
		const requests = new InvokerRequests();

		await runDiagnose(
			request(directory),
			dependencies(recorder, answeringWith(ANSWER), requests),
		);

		expect(requests.models).toEqual(["sonnet"]);
		expect(recorder.stderr).toEqual([
			`Analyzing run ${RUN} with sonnet; the call spends at most $1.\n`,
		]);
		expect(recorder.stdout).toEqual([
			`${join(directory, "analyses", RUN, "2026-10-04T12-00-00.000Z.json")}\n`,
		]);
	});

	it("caps the call at the budget it is given", async () => {
		const directory = await endedRun();
		const recorder = recordOutput();

		await runDiagnose(
			request(directory, { id: `run:${RUN}`, budgetUsd: "2.5" }),
			dependencies(recorder, answeringWith(ANSWER)),
		);

		expect(recorder.stderr).toEqual([
			`Analyzing run ${RUN} with sonnet; the call spends at most $2.5.\n`,
		]);
	});

	it("reads a budget in the exponent form a tiny number prints in", async () => {
		const directory = await endedRun();
		const recorder = recordOutput();

		await runDiagnose(
			request(directory, { id: `run:${RUN}`, budgetUsd: String(5e-7) }),
			dependencies(recorder, answeringWith(ANSWER)),
		);

		expect(recorder.stderr).toEqual([
			`Analyzing run ${RUN} with sonnet; the call spends at most $5e-7.\n`,
		]);
	});

	describe("when the session's answer is refused", () => {
		it("prints the failed record and fails", async () => {
			const directory = await endedRun();
			const recorder = recordOutput();

			const error = await failureOf(
				runDiagnose(
					request(directory),
					dependencies(recorder, answeringWith({ ...ANSWER, stages: [] })),
				),
			);

			expect(recorder.stdout).toHaveLength(1);
			expect(error).not.toBeInstanceOf(UsageError);
			expect(error.message).toStartWith(
				"The root-cause analysis failed: The answer reads stages",
			);
		});
	});

	describe("when the command line is incomplete", () => {
		it.each([
			["no run", { id: undefined }, "Provide the run: rehearse diagnose <run>"],
			["no model", { model: undefined }, "Provide the model: --model <model>"],
			[
				"a zero budget",
				{ budgetUsd: "0" },
				'The budget is a positive number of USD, not "0"',
			],
			[
				"a hexadecimal budget",
				{ budgetUsd: "0x10" },
				'The budget is a positive number of USD, not "0x10"',
			],
		] as const)(
			"refuses %s without a call",
			async (_case, overrides, message) => {
				const directory = await endedRun();
				const requests = new InvokerRequests();

				const error = await failureOf(
					runDiagnose(
						request(directory, overrides),
						dependencies(recordOutput(), answeringWith(ANSWER), requests),
					),
				);

				expect(error).toBeInstanceOf(UsageError);
				expect(error.message).toBe(message);
				expect(requests.models).toEqual([]);
			},
		);
	});
});
