import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeEnvelope } from "#benchmark/contracts";
import type { AnalysisInvoker } from "#benchmark/culprit-analysis";
import {
	RUN,
	runStoppedAtBuild,
} from "#benchmark/culprit-analysis-test-support";
import { nothingRunning } from "#benchmark/run-records-test-support";
import type { AnalyzeDependencies, AnalyzeRequest } from "#cli/analyze-command";
import { runAnalyze } from "#cli/analyze-command";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import type { OutputRecorder } from "#cli/cli-test-support";
import { UsageError } from "#cli/commands";

const ANSWER = {
	culprit: { step: "build", file: "skills/build/SKILL.md" },
	narrative: "the build skill never asks for a direct run",
	pairedRerun: "replay build with the run step restored",
	steps: [
		{
			step: "shape",
			role: "not implicated",
			note: "the card was complete",
			contribution: "left the grade where it was",
		},
		{
			step: "build",
			role: "primary culprit",
			note: "no direct run was recorded",
			contribution: "cost the observed-result requirement",
		},
	],
} as const;

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

function answering(
	structuredOutput: ClaudeEnvelope["structured_output"],
): AnalysisInvoker {
	return () =>
		Promise.resolve(
			JSON.stringify({
				session_id: "analysis-session",
				total_cost_usd: 0.24,
				structured_output: structuredOutput,
			}),
		);
}

function request(
	runsDirectory: string,
	overrides: Partial<AnalyzeRequest> = {},
): AnalyzeRequest {
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
): AnalyzeDependencies {
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

describe(runAnalyze.name, () => {
	it("prints the record it wrote, after stating what the call could spend", async () => {
		const directory = await endedRun();
		const recorder = recordOutput();
		const requests = new InvokerRequests();

		await runAnalyze(
			request(directory),
			dependencies(recorder, answering(ANSWER), requests),
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

		await runAnalyze(
			request(directory, { id: `run:${RUN}`, budgetUsd: "2.5" }),
			dependencies(recorder, answering(ANSWER)),
		);

		expect(recorder.stderr).toEqual([
			`Analyzing run ${RUN} with sonnet; the call spends at most $2.5.\n`,
		]);
	});

	describe("when the session's answer is refused", () => {
		it("prints the failed record and fails", async () => {
			const directory = await endedRun();
			const recorder = recordOutput();

			const error = await failureOf(
				runAnalyze(
					request(directory),
					dependencies(recorder, answering({ ...ANSWER, steps: [] })),
				),
			);

			expect(recorder.stdout).toHaveLength(1);
			expect(error).not.toBeInstanceOf(UsageError);
			expect(error.message).toStartWith(
				"The culprit analysis failed: The answer reads steps",
			);
		});
	});

	describe("when the command line is incomplete", () => {
		it.each([
			[{ id: undefined }, "Provide the run: rehearse analyze <run>"],
			[{ model: undefined }, "Provide the model: --model <model>"],
			[{ budgetUsd: "0" }, 'The budget is a positive number of USD, not "0"'],
			[
				{ budgetUsd: "0x10" },
				'The budget is a positive number of USD, not "0x10"',
			],
		] as const)("refuses %o without a call", async (overrides, message) => {
			const directory = await endedRun();
			const requests = new InvokerRequests();

			const error = await failureOf(
				runAnalyze(
					request(directory, overrides),
					dependencies(recordOutput(), answering(ANSWER), requests),
				),
			);

			expect(error).toBeInstanceOf(UsageError);
			expect(error.message).toBe(message);
			expect(requests.models).toEqual([]);
		});
	});
});
