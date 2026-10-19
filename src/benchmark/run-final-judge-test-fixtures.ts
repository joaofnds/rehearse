import { expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FinalJudgeResponses } from "./final-judge-record-test-fixtures";
import type { JudgeInvoker } from "./judge-attempt";
import { createRunAbort } from "./run-abort";
import type { RunAbort } from "./run-abort";
import type { RunArtifactBaseInputs } from "./run-artifact";
import ControlledRunArtifactPersistence from "./run-artifact-persistence-test-fixture";
import { fakeRunAbortSignals } from "./test-support";

interface FinalJudgeFixtureInputs {
	readonly inputs: RunArtifactBaseInputs;
	readonly responses: FinalJudgeResponses;
}
interface LocatedFinalJudgeFixture extends FinalJudgeFixtureInputs {
	readonly directory: string;
}
interface FinalJudgeResourceOwner {
	readonly track: (directory: string) => void;
}
const NO_JUDGE_CALLS = 0;
const CALL_COUNT_INCREMENT = 1;
const INITIAL_JUDGE_ATTEMPT_COUNT = 1;
const RETRY_JUDGE_BUDGET_INDEX = 1;
class FinalJudgeFixture {
	public readonly persistence = new ControlledRunArtifactPersistence();
	public readonly artifactFile: string;
	public readonly abort: RunAbort;
	public readonly inputs: RunArtifactBaseInputs;
	public readonly budgets: number[] = [];
	public calls = NO_JUDGE_CALLS;
	private readonly responses: FinalJudgeResponses;
	public constructor({
		directory,
		inputs,
		responses,
	}: LocatedFinalJudgeFixture) {
		this.inputs = inputs;
		this.responses = responses;
		this.artifactFile = join(directory, "run.json");

		this.abort = createRunAbort(
			{
				killActiveCommands: async () => {
					await Promise.resolve();
				},
				...fakeRunAbortSignals(),
				persistence: this.persistence,
				reportError: (message) => {
					expect.unreachable(message);
				},
			},
			{
				artifactFile: this.artifactFile,
				operatorStopFile: "/runs/operator-stop.json",
				teardown: async () => {
					await Promise.resolve();
				},
			},
		);
	}
	public static async create(
		resources: FinalJudgeResourceOwner,
		inputs: FinalJudgeFixtureInputs,
	): Promise<FinalJudgeFixture> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-final-judge-"));
		resources.track(directory);

		return new FinalJudgeFixture({ ...inputs, directory });
	}
	public readonly invoke: JudgeInvoker = async (_prompt, budgetUsd) => {
		this.budgets.push(budgetUsd);
		this.calls += CALL_COUNT_INCREMENT;

		return await Promise.resolve(
			this.calls === INITIAL_JUDGE_ATTEMPT_COUNT
				? this.responses.initial
				: this.responses.retry,
		);
	};
	public get retryBudget(): number | undefined {
		return this.budgets[RETRY_JUDGE_BUDGET_INDEX];
	}
}
export { FinalJudgeFixture as default };
