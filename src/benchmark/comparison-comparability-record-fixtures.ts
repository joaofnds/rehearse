import type {
	ConfirmationGroupRecord,
	ParsedConfirmationGroupRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import { NOTHING_DELIVERED } from "./corpus-delivery";

const FIRST_GENERATED_DIGEST_DIGIT = 4;

const PER_REP_MAXIMUM_USD = 20;

const ORDINAL_BASE = 1;

const DEFAULT_CONFIRMATION_REPS = 2;

const PIPELINE_CONFIRMATION_RECORD_VERSION = 1;

const SHA256_HEX_CHARACTERS = 64;

const GIT_SHA_HEX_CHARACTERS = 40;

interface GroupFixtureOptions {
	readonly caseId: string;
	readonly groupId: string;
	readonly corpusDigest: string;
	readonly model?: string | undefined;
	readonly mode?: "stage" | "pipeline" | undefined;
	readonly stages?: string[] | undefined;
	readonly reps?: number | undefined;
}

const CHANGED_CONTROLLED_SCALARS = [
	{ field: "effort", value: "high" },
	{ field: "judgeEffort", value: "low" },
	{ field: "judgeModel", value: "haiku" },
	{ field: "model", value: "haiku" },
	{ field: "pipelinePath", value: "pipelines/other.json" },
	{ field: "sessionBudgetUsd", value: 6 },
] as const;

type ControlledScalar = (typeof CHANGED_CONTROLLED_SCALARS)[number]["field"];

function groupRecord(
	options: Immutable<GroupFixtureOptions>,
): Immutable<ConfirmationGroupRecord> {
	const reps = options.reps ?? DEFAULT_CONFIRMATION_REPS;

	return {
		approval: { approved: true, method: "yes" },
		caseId: options.caseId,
		declaredStages: options.stages ?? ["build"],
		groupId: options.groupId,
		inputs: {
			corpusDelivery: NOTHING_DELIVERED,
			files: controlledGroupFiles(options),
			finalJudgeContractSha256:
				options.mode === "pipeline"
					? "f".repeat(SHA256_HEX_CHARACTERS)
					: undefined,
			judgeContractSha256: "a".repeat(SHA256_HEX_CHARACTERS),
			judgeModel: "opus",
			lineage: {
				kind: "CHECKPOINT",
				lineage: "checkpoint-1",
				targetSha: "a".repeat(GIT_SHA_HEX_CHARACTERS),
			},
			model: options.model ?? "sonnet",
			pipelinePath: "pipelines/default.json",
			sessionBudgetUsd: 5,
		},
		makespanMs: 100,
		mode: options.mode ?? "stage",
		projectedCost: {
			perRepMaximumUsd: 20,
			reps,
			totalMaximumUsd: PER_REP_MAXIMUM_USD * reps,
		},
		repRecords: Array.from({ length: reps }, (_value, index) => ({
			ordinal: index + ORDINAL_BASE,
			path: `reps/${options.groupId}-rep-${index + ORDINAL_BASE}/rep.json`,
			repId: `${options.groupId}-rep-${index + ORDINAL_BASE}`,
		})),
		reportFile: "report.json",
		reps,
		schemaVersion: 1,
	};
}

function legacyRecord(
	record: Immutable<ParsedConfirmationGroupRecord>,
): Immutable<ConfirmationGroupRecord> {
	if (record.schemaVersion !== PIPELINE_CONFIRMATION_RECORD_VERSION) {
		throw new Error("This fixture helper only edits legacy groups");
	}

	return record;
}

function withChangedScalar(
	record: Immutable<ParsedConfirmationGroupRecord>,
	field: ControlledScalar,
	value: (typeof CHANGED_CONTROLLED_SCALARS)[number]["value"],
): Immutable<ConfirmationGroupRecord> {
	const legacy = legacyRecord(record);
	return {
		...legacy,
		inputs: {
			...legacy.inputs,
			[field]: value,
		},
	};
}

function withChangedFile(
	record: Immutable<ParsedConfirmationGroupRecord>,
	kind: "checkpoint" | "pipeline" | "product-brief" | "rubric" | "task",
): Immutable<ConfirmationGroupRecord> {
	const legacy = legacyRecord(record);
	return {
		...legacy,
		inputs: {
			...legacy.inputs,
			files: legacy.inputs.files.map((file) =>
				file.kind === kind
					? {
							kind: file.kind,
							path: file.path,
							sha256: "f".repeat(SHA256_HEX_CHARACTERS),
						}
					: file,
			),
		},
	};
}

function controlledGroupFiles(
	options: Immutable<GroupFixtureOptions>,
): Immutable<ConfirmationGroupRecord["inputs"]["files"]> {
	return [
		{
			kind: "checkpoint",
			path: "inputs/checkpoint/state.json",
			sha256: "b".repeat(SHA256_HEX_CHARACTERS),
		},
		{
			kind: "corpus",
			path: "inputs/corpus/build/SKILL.md",
			sha256: options.corpusDigest,
		},
		{
			kind: "task",
			path: "inputs/task.md",
			sha256: "c".repeat(SHA256_HEX_CHARACTERS),
		},
		...(["pipeline", "product-brief", "rubric"] as const).map(
			(kind, index) => ({
				kind,
				path: `inputs/${kind}`,
				sha256: String(index + FIRST_GENERATED_DIGEST_DIGIT).repeat(
					SHA256_HEX_CHARACTERS,
				),
			}),
		),
	];
}
export {
	CHANGED_CONTROLLED_SCALARS,
	GIT_SHA_HEX_CHARACTERS,
	groupRecord,
	legacyRecord,
	SHA256_HEX_CHARACTERS,
	withChangedFile,
	withChangedScalar,
};
