import {
	SHA256_HEX_CHARACTERS,
	groupRecord,
} from "./comparison-comparability-record-fixtures";
import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
} from "./comparison-evidence";
import type { ComparisonArm } from "./comparison-record";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const RETAINED_BASELINE_REP_COUNT = 1;

const FIRST_REPORTED_CASE_INDEX = 0;

const PREFIX_START_INDEX = 0;

const CORPUS_DIGESTS = {
	baseline: "1".repeat(SHA256_HEX_CHARACTERS),
	candidate: "2".repeat(SHA256_HEX_CHARACTERS),
	control: "3".repeat(SHA256_HEX_CHARACTERS),
} as const;

interface ChangedContract {
	readonly mode?: "stage" | "pipeline" | undefined;
	readonly stages?: string[] | undefined;
	readonly reps?: number | undefined;
}

const CONTROLLED_FILE_KINDS = [
	"checkpoint",
	"pipeline",
	"product-brief",
	"rubric",
	"task",
] as const;

function arm(
	role: ComparisonArm,
	record: Immutable<ParsedConfirmationGroupRecord>,
): ComparisonArmEvidence {
	const group = {
		path: `${record.groupId}/group.json`,
		record,
		sha256: "d".repeat(SHA256_HEX_CHARACTERS),
	};

	return {
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus" && kind !== "instructions",
		),
		declaredCaseId: record.caseId,
		executedCorpus: record.inputs.files.filter(({ kind }) => kind === "corpus"),
		group,
		groups: [group],
		reps: [],
		role,
		sourcePaths: [],
	};
}

function benchmarkCase(
	caseId: string,
	corpusDigests: Readonly<Record<ComparisonArm, string>>,
): ComparisonCaseEvidence {
	return {
		arms: {
			baseline: arm(
				"baseline",
				groupRecord({
					caseId,
					corpusDigest: corpusDigests.baseline,
					groupId: `${caseId}-baseline`,
				}),
			),
			candidate: arm(
				"candidate",
				groupRecord({
					caseId,
					corpusDigest: corpusDigests.candidate,
					groupId: `${caseId}-candidate`,
				}),
			),
			control: arm(
				"control",
				groupRecord({
					caseId,
					corpusDigest: corpusDigests.control,
					groupId: `${caseId}-control`,
				}),
			),
		},
		caseId,
	};
}

function pipelineArm(
	caseId: string,
	role: ComparisonArm,
	checkpointDigest: string,
): ComparisonArmEvidence {
	const group = groupRecord({
		caseId,
		corpusDigest: CORPUS_DIGESTS[role],
		groupId: `${caseId}-${role}`,
		mode: "pipeline",
	});
	const files = group.inputs.files.map((file) =>
		file.kind === "checkpoint"
			? { kind: file.kind, path: file.path, sha256: checkpointDigest }
			: file,
	);

	const evidence = arm(role, {
		...group,
		inputs: {
			corpusDelivery: group.inputs.corpusDelivery,
			effort: group.inputs.effort,
			files,
			judgeEffort: group.inputs.judgeEffort,
			judgeModel: group.inputs.judgeModel,
			lineage: group.inputs.lineage,
			model: group.inputs.model,
			pipelinePath: group.inputs.pipelinePath,
			sessionBudgetUsd: group.inputs.sessionBudgetUsd,
		},
	});

	return {
		...evidence,
		controlledFiles: evidence.controlledFiles.map((file) =>
			file.kind === "checkpoint"
				? {
						kind: file.kind,
						path: file.path,
						sha256: "9".repeat(SHA256_HEX_CHARACTERS),
					}
				: file,
		),
	};
}

function pipelineBenchmarkCase(caseId: string): ComparisonCaseEvidence {
	return {
		arms: {
			baseline: pipelineArm(
				caseId,
				"baseline",
				"6".repeat(SHA256_HEX_CHARACTERS),
			),
			candidate: pipelineArm(
				caseId,
				"candidate",
				"7".repeat(SHA256_HEX_CHARACTERS),
			),
			control: pipelineArm(
				caseId,
				"control",
				"8".repeat(SHA256_HEX_CHARACTERS),
			),
		},
		caseId,
	};
}

function casesWithChangedControl(
	change: Immutable<ChangedContract>,
): readonly ComparisonCaseEvidence[] {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedControl = arm(
		"control",
		groupRecord({
			caseId: "case-1",
			corpusDigest: CORPUS_DIGESTS.control,
			groupId: "case-1-control",
			mode: change.mode,
			reps: change.reps,
			stages: change.stages,
		}),
	);

	return [
		{
			arms: {
				baseline: first.arms.baseline,
				candidate: first.arms.candidate,
				control: changedControl,
			},
			caseId: first.caseId,
		},
		benchmarkCase("case-2", CORPUS_DIGESTS),
	];
}

export {
	CONTROLLED_FILE_KINDS,
	CORPUS_DIGESTS,
	FIRST_REPORTED_CASE_INDEX,
	PREFIX_START_INDEX,
	RETAINED_BASELINE_REP_COUNT,
	arm,
	benchmarkCase,
	casesWithChangedControl,
	pipelineBenchmarkCase,
};
