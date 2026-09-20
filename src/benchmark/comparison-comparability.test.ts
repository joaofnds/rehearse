import { describe, expect, it } from "bun:test";
import type {
	ConfirmationGroupRecord,
	ParsedConfirmationGroupRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
} from "./comparison-evidence";
import { assertComparableComparison } from "./comparison-comparability";
import type { ComparisonArm } from "./comparison-record";

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
	["effort", "high"],
	["judgeEffort", "low"],
	["judgeModel", "haiku"],
	["model", "haiku"],
	["pipelinePath", "pipelines/other.json"],
	["sessionBudgetUsd", 6],
] as const;

type ControlledScalar = (typeof CHANGED_CONTROLLED_SCALARS)[number][0];

function groupRecord(
	options: Immutable<GroupFixtureOptions>,
): Immutable<ConfirmationGroupRecord> {
	const reps = options.reps ?? 2;

	return {
		schemaVersion: 1,
		caseId: options.caseId,
		groupId: options.groupId,
		mode: options.mode ?? "stage",
		reps,
		declaredStages: options.stages ?? ["build"],
		inputs: {
			lineage: {
				kind: "CHECKPOINT",
				lineage: "checkpoint-1",
				targetSha: "a".repeat(40),
			},
			files: [
				{
					kind: "checkpoint",
					path: "inputs/checkpoint/state.json",
					sha256: "b".repeat(64),
				},
				{
					kind: "corpus",
					path: "inputs/corpus/build/SKILL.md",
					sha256: options.corpusDigest,
				},
				{
					kind: "task",
					path: "inputs/task.md",
					sha256: "c".repeat(64),
				},
				...(["pipeline", "product-brief", "rubric"] as const).map(
					(kind, index) => ({
						kind,
						path: `inputs/${kind}`,
						sha256: String(index + 4).repeat(64),
					}),
				),
			],
			model: options.model ?? "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
		},
		projectedCost: {
			reps,
			perRepMaximumUsd: 20,
			totalMaximumUsd: 20 * reps,
		},
		approval: { method: "yes", approved: true },
		repRecords: Array.from({ length: reps }, (_value, index) => ({
			repId: `${options.groupId}-rep-${index + 1}`,
			ordinal: index + 1,
			path: `reps/${options.groupId}-rep-${index + 1}/rep.json`,
		})),
		reportFile: "report.json",
		makespanMs: 100,
	};
}

function legacyRecord(
	record: Immutable<ParsedConfirmationGroupRecord>,
): Immutable<ConfirmationGroupRecord> {
	if (record.schemaVersion !== 1) {
		throw new Error("This fixture helper only edits legacy groups");
	}

	return record;
}

function withChangedScalar(
	record: Immutable<ParsedConfirmationGroupRecord>,
	field: ControlledScalar,
	value: (typeof CHANGED_CONTROLLED_SCALARS)[number][1],
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
					? { kind: file.kind, path: file.path, sha256: "f".repeat(64) }
					: file,
			),
		},
	};
}

function arm(
	role: ComparisonArm,
	record: Immutable<ParsedConfirmationGroupRecord>,
): ComparisonArmEvidence {
	return {
		role,
		declaredCaseId: record.caseId,
		group: {
			path: `${record.groupId}/group.json`,
			sha256: "d".repeat(64),
			record,
		},
		reps: [],
		executedCorpus: record.inputs.files.filter(({ kind }) => kind === "corpus"),
		controlledFiles: record.inputs.files.filter(
			({ kind }) => kind !== "corpus" && kind !== "instructions",
		),
		sourcePaths: [],
	};
}

function benchmarkCase(
	caseId: string,
	corpusDigests: Readonly<Record<ComparisonArm, string>>,
): ComparisonCaseEvidence {
	return {
		caseId,
		arms: {
			baseline: arm(
				"baseline",
				groupRecord({
					caseId,
					groupId: `${caseId}-baseline`,
					corpusDigest: corpusDigests.baseline,
				}),
			),
			candidate: arm(
				"candidate",
				groupRecord({
					caseId,
					groupId: `${caseId}-candidate`,
					corpusDigest: corpusDigests.candidate,
				}),
			),
			control: arm(
				"control",
				groupRecord({
					caseId,
					groupId: `${caseId}-control`,
					corpusDigest: corpusDigests.control,
				}),
			),
		},
	};
}

const CORPUS_DIGESTS = {
	baseline: "1".repeat(64),
	candidate: "2".repeat(64),
	control: "3".repeat(64),
} as const;

function pipelineArm(
	caseId: string,
	role: ComparisonArm,
	checkpointDigest: string,
): ComparisonArmEvidence {
	const group = groupRecord({
		caseId,
		groupId: `${caseId}-${role}`,
		corpusDigest: CORPUS_DIGESTS[role],
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
			lineage: group.inputs.lineage,
			files,
			model: group.inputs.model,
			effort: group.inputs.effort,
			judgeModel: group.inputs.judgeModel,
			judgeEffort: group.inputs.judgeEffort,
			sessionBudgetUsd: group.inputs.sessionBudgetUsd,
			pipelinePath: group.inputs.pipelinePath,
		},
	});

	return {
		...evidence,
		controlledFiles: evidence.controlledFiles.map((file) =>
			file.kind === "checkpoint"
				? { kind: file.kind, path: file.path, sha256: "9".repeat(64) }
				: file,
		),
	};
}

function pipelineBenchmarkCase(caseId: string): ComparisonCaseEvidence {
	return {
		caseId,
		arms: {
			baseline: pipelineArm(caseId, "baseline", "6".repeat(64)),
			candidate: pipelineArm(caseId, "candidate", "7".repeat(64)),
			control: pipelineArm(caseId, "control", "8".repeat(64)),
		},
	};
}
interface ChangedContract {
	readonly mode?: "stage" | "pipeline" | undefined;
	readonly stages?: string[] | undefined;
	readonly reps?: number | undefined;
}

function casesWithChangedControl(
	change: Immutable<ChangedContract>,
): readonly ComparisonCaseEvidence[] {
	const first = benchmarkCase("case-1", CORPUS_DIGESTS);
	const changedControl = arm(
		"control",
		groupRecord({
			caseId: "case-1",
			groupId: "case-1-control",
			corpusDigest: CORPUS_DIGESTS.control,
			mode: change.mode,
			stages: change.stages,
			reps: change.reps,
		}),
	);

	return [
		{
			caseId: first.caseId,
			arms: {
				baseline: first.arms.baseline,
				candidate: first.arms.candidate,
				control: changedControl,
			},
		},
		benchmarkCase("case-2", CORPUS_DIGESTS),
	];
}

describe(assertComparableComparison.name, () => {
	it("accepts corpus treatment differences with matched controlled inputs", () => {
		const cases = [
			benchmarkCase("case-1", CORPUS_DIGESTS),
			benchmarkCase("case-2", CORPUS_DIGESTS),
		];

		const contract = assertComparableComparison(cases);

		expect(contract).toEqual({
			mode: "stage",
			declaredStages: ["build"],
			reps: 2,
		});
	});

	it("refuses a single case outside session mode, naming the mode", () => {
		const cases = [benchmarkCase("case-1", CORPUS_DIGESTS)];

		expect(() => assertComparableComparison(cases)).toThrow(
			"requires at least two cases in stage mode",
		);
	});

	it("refuses a comparison naming no case at all", () => {
		expect(() => assertComparableComparison([])).toThrow(
			"requires at least one case",
		);
	});

	it("accepts pipeline checkpoints derived from each corpus arm", () => {
		const cases = [
			pipelineBenchmarkCase("case-1"),
			pipelineBenchmarkCase("case-2"),
		];

		expect(() => assertComparableComparison(cases)).not.toThrow();
	});

	it("rejects changed pipeline checkpoint workflow state", () => {
		const cases = [
			pipelineBenchmarkCase("case-1"),
			pipelineBenchmarkCase("case-2"),
		];
		const [first] = cases;
		if (first === undefined) {
			throw new Error("missing fixture case");
		}
		const { candidate } = first.arms;
		cases[0] = {
			...first,
			arms: {
				...first.arms,
				candidate: {
					...candidate,
					controlledFiles: candidate.controlledFiles.map((file) =>
						file.kind === "checkpoint"
							? {
									kind: file.kind,
									path: file.path,
									sha256: "a".repeat(64),
								}
							: file,
					),
				},
			},
		};

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-1 arms baseline and candidate field inputs.files.checkpoint",
		);
	});

	it("rejects a changed non-corpus input with both arms named", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const changedCandidate = arm(
			"candidate",
			groupRecord({
				caseId: "case-1",
				groupId: "case-1-candidate",
				corpusDigest: CORPUS_DIGESTS.candidate,
				model: "haiku",
			}),
		);
		const cases = [
			{
				caseId: first.caseId,
				arms: {
					baseline: first.arms.baseline,
					candidate: changedCandidate,
					control: first.arms.control,
				},
			},
			benchmarkCase("case-2", CORPUS_DIGESTS),
		];

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-1 arms baseline and candidate field inputs.model",
		);
	});

	for (const [field, value] of CHANGED_CONTROLLED_SCALARS) {
		it(`rejects changed controlled scalar ${field}`, () => {
			const first = benchmarkCase("case-1", CORPUS_DIGESTS);
			const changedCandidate = arm(
				"candidate",
				withChangedScalar(first.arms.candidate.group.record, field, value),
			);

			expect(() =>
				assertComparableComparison([
					{
						...first,
						arms: { ...first.arms, candidate: changedCandidate },
					},
					benchmarkCase("case-2", CORPUS_DIGESTS),
				]),
			).toThrow(`field inputs.${field}`);
		});
	}

	for (const kind of [
		"checkpoint",
		"pipeline",
		"product-brief",
		"rubric",
		"task",
	] as const) {
		it(`rejects changed controlled file ${kind}`, () => {
			const first = benchmarkCase("case-1", CORPUS_DIGESTS);
			const changedCandidate = arm(
				"candidate",
				withChangedFile(first.arms.candidate.group.record, kind),
			);

			expect(() =>
				assertComparableComparison([
					{
						...first,
						arms: { ...first.arms, candidate: changedCandidate },
					},
					benchmarkCase("case-2", CORPUS_DIGESTS),
				]),
			).toThrow(`field inputs.files.${kind}`);
		});
	}

	it("rejects a changed controlled lineage", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const candidateRecord = legacyRecord(first.arms.candidate.group.record);
		const changedCandidate = arm("candidate", {
			...candidateRecord,
			inputs: {
				...candidateRecord.inputs,
				lineage: { kind: "SOURCE", sha: "e".repeat(40) },
			},
		});

		expect(() =>
			assertComparableComparison([
				{
					...first,
					arms: { ...first.arms, candidate: changedCandidate },
				},
				benchmarkCase("case-2", CORPUS_DIGESTS),
			]),
		).toThrow("field inputs.lineage");
	});

	it("rejects a changed corpus snapshot within one arm across cases", () => {
		const cases = [
			benchmarkCase("case-1", CORPUS_DIGESTS),
			benchmarkCase("case-2", {
				baseline: CORPUS_DIGESTS.baseline,
				candidate: "4".repeat(64),
				control: CORPUS_DIGESTS.control,
			}),
		];

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-2 arm candidate field inputs.files.corpus differs from case case-1",
		);
	});

	it("rejects a changed reportable group contract", () => {
		const cases = casesWithChangedControl({ stages: ["discuss", "build"] });

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-1 arm control field declaredStages differs from case case-1 arm baseline",
		);
	});

	it("rejects a contract change in another case and arm", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const second = benchmarkCase("case-2", CORPUS_DIGESTS);
		const { candidate } = second.arms;
		const changedCandidate = arm("candidate", {
			...legacyRecord(candidate.group.record),
			declaredStages: ["discuss", "build"],
		});

		expect(() =>
			assertComparableComparison([
				first,
				{
					...second,
					arms: { ...second.arms, candidate: changedCandidate },
				},
			]),
		).toThrow(
			"case case-2 arm candidate field declaredStages differs from case case-1 arm baseline",
		);
	});

	it("rejects a changed confirmation mode", () => {
		const cases = casesWithChangedControl({ mode: "pipeline" });

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-1 arm control field mode differs from case case-1 arm baseline",
		);
	});

	it("rejects a changed requested rep count", () => {
		const cases = casesWithChangedControl({ reps: 3 });

		expect(() => assertComparableComparison(cases)).toThrow(
			"case case-1 arm control field reps differs from case case-1 arm baseline",
		);
	});

	it("rejects an arm whose group recorded a different case", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const candidate = arm("candidate", {
			...legacyRecord(first.arms.candidate.group.record),
			caseId: "case-2",
		});

		expect(() =>
			assertComparableComparison([
				{ ...first, arms: { ...first.arms, candidate } },
				benchmarkCase("case-2", CORPUS_DIGESTS),
			]),
		).toThrow(
			"case case-1 arm candidate field caseId recorded case-2; expected case-1",
		);
	});

	it("accepts an arm whose legacy group declared no case at all", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const candidate: ComparisonArmEvidence = {
			...first.arms.candidate,
			declaredCaseId: undefined,
		};

		expect(() =>
			assertComparableComparison([
				{ ...first, arms: { ...first.arms, candidate } },
				benchmarkCase("case-2", CORPUS_DIGESTS),
			]),
		).not.toThrow();
	});

	it("accepts arms whose groups all recorded the manifest's case", () => {
		expect(() =>
			assertComparableComparison([
				benchmarkCase("case-1", CORPUS_DIGESTS),
				benchmarkCase("case-2", CORPUS_DIGESTS),
			]),
		).not.toThrow();
	});

	it("rejects an arm without the expected rep records", () => {
		const first = benchmarkCase("case-1", CORPUS_DIGESTS);
		const baselineRecord = legacyRecord(first.arms.baseline.group.record);
		const baseline = arm("baseline", {
			...baselineRecord,
			repRecords: baselineRecord.repRecords.slice(0, 1),
		});

		expect(() =>
			assertComparableComparison([
				{ ...first, arms: { ...first.arms, baseline } },
				benchmarkCase("case-2", CORPUS_DIGESTS),
			]),
		).toThrow(
			"case case-1 arm baseline field repRecords has 1 reps; expected 2",
		);
	});
});
