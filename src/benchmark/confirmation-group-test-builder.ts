import type { ConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const SHA256_HEX_CHARACTERS = 64;
const GIT_SHA_HEX_CHARACTERS = 40;

function recordedGroupInputs(): Immutable<ConfirmationGroupRecord["inputs"]> {
	return {
		effort: "high",
		files: [
			{
				kind: "corpus",
				path: "inputs/corpus/build/SKILL.md",
				sha256: "b".repeat(SHA256_HEX_CHARACTERS),
			},
			{
				kind: "rubric",
				path: "inputs/rubrics/build.json",
				sha256: "c".repeat(SHA256_HEX_CHARACTERS),
			},
		],
		judgeEffort: "high",
		judgeModel: "opus",
		lineage: {
			kind: "CHECKPOINT",
			lineage: "checkpoint-1",
			targetSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
		},
		model: "sonnet",
		pipelinePath: "pipelines/default.json",
		sessionBudgetUsd: 5,
	};
}

class ConfirmationGroupBuilder {
	readonly #values: Immutable<Partial<ConfirmationGroupRecord>>;
	public constructor(values: Immutable<Partial<ConfirmationGroupRecord>> = {}) {
		this.#values = values;
	}
	public build(): Immutable<ConfirmationGroupRecord> {
		return {
			approval: { approved: true, method: "yes" },
			caseId: "audit-log",
			declaredStages: ["build"],
			groupId: "group-1",
			inputs: recordedGroupInputs(),
			makespanMs: 300,
			mode: "stage",
			projectedCost: {
				perRepMaximumUsd: 20,
				reps: 2,
				totalMaximumUsd: 40,
			},
			repRecords: [
				{
					ordinal: 1,
					path: "reps/group-1-rep-1/rep.json",
					repId: "group-1-rep-1",
				},
				{
					ordinal: 2,
					path: "reps/group-1-rep-2/rep.json",
					repId: "group-1-rep-2",
				},
			],
			reportFile: "report.json",
			reps: 2,
			schemaVersion: 1,
			...this.#values,
		};
	}
}
export { ConfirmationGroupBuilder as default };
