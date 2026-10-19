import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const GIT_SHA_HEX_CHARACTERS = 40;

function recordedRepStages(
	resultSha: string,
): Immutable<ConfirmationRepRecord["stages"]> {
	return [
		{
			elapsedMs: 120,
			evidence: {
				recordFile: "stages/shape.json",
				resultSha,
			},
			grade: "A",
			stage: "shape",
			status: "JUDGED",
			verdict: "CONTINUE",
		},
	];
}

class ConfirmationRepBuilder {
	readonly #values: Immutable<Partial<ConfirmationRepRecord>>;
	public constructor(values: Immutable<Partial<ConfirmationRepRecord>> = {}) {
		this.#values = values;
	}
	public build(): Immutable<ConfirmationRepRecord> {
		const resultSha = "a".repeat(GIT_SHA_HEX_CHARACTERS);
		const metrics = {
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			costUsd: 0.5,
			inputTokens: 100,
			outputTokens: 20,
			turns: 3,
		};

		return {
			caseId: "audit-log",
			elapsedMs: 500,
			finalOutcome: {
				evidence: {
					recordFile: "rep.json",
					resultSha,
				},
				status: "JUDGED",
				verdict: "PASS",
			},
			groupId: "group-1",
			lineage: { kind: "SOURCE", sha: resultSha },
			metrics: {
				calls: [
					{ metrics, role: "worker" },
					{ metrics: { ...metrics, turns: 1 }, role: "product-owner" },
					{ metrics: { ...metrics, turns: 2 }, role: "stage-judge" },
					{ metrics: { ...metrics, turns: 2 }, role: "final-judge" },
				],
				status: "COMPLETE",
			},
			mode: "pipeline",
			ordinal: 1,
			outcome: "SUCCESSFUL",
			repId: "group-1-rep-1",
			schemaVersion: 1,
			stages: recordedRepStages(resultSha),
			workerTrajectorySteps: 3,
			worktreePath: "/worktrees/group-1-rep-1",
			...this.#values,
		};
	}
}
export { ConfirmationRepBuilder as default };
