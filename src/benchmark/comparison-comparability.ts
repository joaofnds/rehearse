import { createHash } from "node:crypto";
import { parseCheckpointRecord } from "./checkpoint";
import type { SessionCaseDeclaration } from "./case";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
	ComparisonContract,
	FrozenFile,
	LoadedComparisonArmEvidence,
	LoadedComparisonArmGroups,
	LoadedComparisonCaseEvidence,
} from "./comparison-evidence";
import { ComparisonEvidenceError } from "./comparison-evidence";
import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";

function sha256(bytes: Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function executedCorpusFiles(
	group: Immutable<ParsedConfirmationGroupRecord>,
): readonly FrozenFile[] {
	const corpus = group.inputs.files.filter(({ kind }) => kind === "corpus");
	if (group.mode === "pipeline" || group.mode === "session") {
		return corpus;
	}

	const [selectedStage] = group.declaredStages;

	return corpus.filter((file) => {
		const segments = file.path.replaceAll("\\", "/").split("/");
		const corpusIndex = segments.lastIndexOf("corpus");

		return segments[corpusIndex + 1] === selectedStage;
	});
}

function controlledCheckpointDigest(text: string): string {
	const checkpoint = parseCheckpointRecord(text);

	return sha256(
		new TextEncoder().encode(
			JSON.stringify({
				stage: checkpoint.stage,
				model: checkpoint.model,
				effort: checkpoint.effort,
				corpusFiles: checkpoint.corpusFiles,
				artifacts: checkpoint.artifacts,
				workflowState: checkpoint.workflowState,
			}),
		),
	);
}

function projectArm(
	caseId: string,
	arm: Immutable<LoadedComparisonArmEvidence>,
): ComparisonArmEvidence {
	const controlledFiles = arm.frozenFiles.flatMap(({ record, text }) => {
		if (record.kind === "corpus" || record.kind === "instructions") {
			return [];
		}

		let normalizedDigest = record.sha256;
		if (
			arm.group.record.mode === "pipeline" &&
			record.kind === "checkpoint" &&
			record.path.replaceAll("\\", "/").endsWith("/checkpoint.json")
		) {
			try {
				normalizedDigest = controlledCheckpointDigest(text);
			} catch {
				throw new ComparisonEvidenceError(
					`case ${caseId} arm ${arm.role} field inputs.files[${record.kind}:${record.path}]: invalid pipeline checkpoint record`,
				);
			}
		}
		if (arm.group.record.mode === "session" && record.kind === "case") {
			if (arm.sessionCase === undefined) {
				throw new ComparisonEvidenceError(
					`case ${caseId} arm ${arm.role} field inputs.files[case:${record.path}]: missing parsed session case declaration`,
				);
			}
			const { corpusFiles: _corpusFiles, ...controlled } = arm.sessionCase;
			normalizedDigest = sha256(
				new TextEncoder().encode(JSON.stringify(controlled)),
			);
		}

		return [{ ...record, sha256: normalizedDigest }];
	});
	const executedCorpus = executedCorpusFiles(arm.group.record);
	if (executedCorpus.length === 0 && arm.group.record.mode !== "session") {
		throw new ComparisonEvidenceError(
			`case ${caseId} arm ${arm.role} field inputs.files.corpus: source group records no executed corpus`,
		);
	}

	const projected = {
		role: arm.role,
		declaredCaseId: arm.declaredCaseId,
		group: arm.group,
		groups: [arm.group],
		reps: arm.reps,
		executedCorpus,
		controlledFiles,
		sourcePaths: arm.sourcePaths,
	};
	if (arm.sessionCase === undefined) {
		return projected;
	}

	return { ...projected, sessionCase: arm.sessionCase };
}

function sameValue<Value>(left: Value, right: Value): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function sortedFiles(files: readonly FrozenFile[]): readonly FrozenFile[] {
	return files.toSorted((left, right) => {
		const leftIdentity = `${left.kind}:${left.path}`;
		const rightIdentity = `${right.kind}:${right.path}`;

		return leftIdentity.localeCompare(rightIdentity);
	});
}

function controlledFileDifference(
	left: readonly FrozenFile[],
	right: readonly FrozenFile[],
): string | undefined {
	const leftFiles = sortedFiles(left);
	const rightFiles = sortedFiles(right);
	const maximum = Math.max(leftFiles.length, rightFiles.length);
	for (let index = 0; index < maximum; index += 1) {
		const leftFile = leftFiles[index];
		const rightFile = rightFiles[index];
		if (sameValue(leftFile, rightFile)) {
			continue;
		}

		const file = leftFile ?? rightFile;

		return file === undefined
			? "inputs.files"
			: `inputs.files.${file.kind}:${file.path}`;
	}

	return undefined;
}

function sessionCaseDifference(
	left: Immutable<SessionCaseDeclaration> | undefined,
	right: Immutable<SessionCaseDeclaration> | undefined,
): string | undefined {
	if (left === undefined || right === undefined) {
		return "inputs.files.case";
	}

	const fields = [
		["id", left.id, right.id],
		["title", left.title, right.title],
		["prompt", left.prompt, right.prompt],
		["fixture", left.fixture, right.fixture],
		["transcript", left.transcript, right.transcript],
		["tools", left.tools, right.tools],
		["settings", left.settings, right.settings],
		["agents", left.agents, right.agents],
		["projectFiles", left.projectFiles, right.projectFiles],
		["checks", left.checks, right.checks],
		["stateCheck", left.stateCheck, right.stateCheck],
		["model", left.model, right.model],
		["sessionBudgetUsd", left.sessionBudgetUsd, right.sessionBudgetUsd],
	] as const;

	for (const [field, leftValue, rightValue] of fields) {
		if (!sameValue(leftValue, rightValue)) {
			return `inputs.files.case.${field}`;
		}
	}

	return undefined;
}

interface ControlledInputComparison {
	readonly caseId: string;
	readonly reference: ComparisonArmEvidence;
	readonly other: ComparisonArmEvidence;
}

function controlledInputDifference(
	comparison: Immutable<ControlledInputComparison>,
): string | undefined {
	const referenceGroup = comparison.reference.group.record;
	const otherGroup = comparison.other.group.record;
	if (referenceGroup.mode === "session" || otherGroup.mode === "session") {
		if (referenceGroup.mode !== "session" || otherGroup.mode !== "session") {
			return "mode";
		}
		const caseDifference = sessionCaseDifference(
			comparison.reference.sessionCase,
			comparison.other.sessionCase,
		);
		if (caseDifference !== undefined) {
			return caseDifference;
		}
		const fileDifference = controlledFileDifference(
			comparison.reference.controlledFiles.filter(
				({ kind }) => kind !== "case",
			),
			comparison.other.controlledFiles.filter(({ kind }) => kind !== "case"),
		);
		if (fileDifference !== undefined) {
			return fileDifference;
		}
		if (referenceGroup.inputs.model !== otherGroup.inputs.model) {
			return "inputs.model";
		}
		if (referenceGroup.inputs.effort !== otherGroup.inputs.effort) {
			return "inputs.effort";
		}
		if (
			referenceGroup.inputs.sessionBudgetUsd !==
			otherGroup.inputs.sessionBudgetUsd
		) {
			return "inputs.sessionBudgetUsd";
		}

		return undefined;
	}
	const fileDifference = controlledFileDifference(
		comparison.reference.controlledFiles,
		comparison.other.controlledFiles,
	);
	if (fileDifference !== undefined) {
		return fileDifference;
	}

	if (!sameValue(referenceGroup.inputs.lineage, otherGroup.inputs.lineage)) {
		return "inputs.lineage";
	}
	if (referenceGroup.inputs.model !== otherGroup.inputs.model) {
		return "inputs.model";
	}
	if (referenceGroup.inputs.effort !== otherGroup.inputs.effort) {
		return "inputs.effort";
	}
	if (referenceGroup.inputs.judgeModel !== otherGroup.inputs.judgeModel) {
		return "inputs.judgeModel";
	}
	if (referenceGroup.inputs.judgeEffort !== otherGroup.inputs.judgeEffort) {
		return "inputs.judgeEffort";
	}
	if (
		referenceGroup.inputs.sessionBudgetUsd !==
		otherGroup.inputs.sessionBudgetUsd
	) {
		return "inputs.sessionBudgetUsd";
	}
	if (referenceGroup.inputs.pipelinePath !== otherGroup.inputs.pipelinePath) {
		return "inputs.pipelinePath";
	}

	return undefined;
}

function assertControlledInputs(
	comparison: Immutable<ControlledInputComparison>,
): void {
	const field = controlledInputDifference(comparison);
	if (field === undefined) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${comparison.caseId} arms ${comparison.reference.role} and ${comparison.other.role} field ${field} differs`,
	);
}

interface ContractComparison {
	readonly caseId: string;
	readonly arm: ComparisonArmEvidence;
	readonly referenceCaseId: string;
	readonly referenceArm: ComparisonArmEvidence;
}

function contractDifference(
	comparison: Immutable<ContractComparison>,
): string | undefined {
	const reference = comparison.referenceArm.group.record;
	const other = comparison.arm.group.record;
	if (reference.mode !== other.mode) {
		return "mode";
	}
	if (!sameValue(reference.declaredStages, other.declaredStages)) {
		return "declaredStages";
	}
	if (armReps(comparison.referenceArm) !== armReps(comparison.arm)) {
		return "reps";
	}

	return undefined;
}

function assertContract(comparison: Immutable<ContractComparison>): void {
	const field = contractDifference(comparison);
	if (field === undefined) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${comparison.caseId} arm ${comparison.arm.role} field ${field} differs from case ${comparison.referenceCaseId} arm ${comparison.referenceArm.role}`,
	);
}

/**
 * The manifest names which declared case each triple of arms ran. A group that
 * recorded a different case answers a different question, so pairing it as an
 * arm of this case would contrast two tasks and call the difference a corpus
 * effect. A group written before cases were declared recorded no case at all,
 * which claims nothing and so contradicts nothing.
 */
function assertArmRanTheCase(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	const recorded = arm.declaredCaseId;
	if (recorded === undefined || recorded === caseId) {
		return;
	}

	throw new ComparisonEvidenceError(
		`case ${caseId} arm ${arm.role} field caseId recorded ${recorded}; expected ${caseId}`,
	);
}

function assertExpectedRepCount(
	caseId: string,
	arm: Immutable<ComparisonArmEvidence>,
): void {
	for (const { record } of arm.groups) {
		const actual = record.repRecords.length;
		const expected = record.reps;
		if (actual !== expected) {
			throw new ComparisonEvidenceError(
				`case ${caseId} arm ${arm.role} field repRecords has ${actual} reps; expected ${expected}`,
			);
		}
	}
}

/** The attempts an arm's groups set out to record, together. */
function armReps(arm: Immutable<ComparisonArmEvidence>): number {
	return arm.groups.reduce((total, { record }) => total + record.reps, 0);
}

function assertArmCorpusSnapshot(
	cases: readonly Immutable<ComparisonCaseEvidence>[],
	role: ComparisonArm,
): void {
	const [reference, ...others] = cases;
	if (reference === undefined) {
		return;
	}

	const referenceSnapshot = sortedFiles(reference.arms[role].executedCorpus);
	for (const benchmarkCase of others) {
		const snapshot = sortedFiles(benchmarkCase.arms[role].executedCorpus);
		if (!sameValue(referenceSnapshot, snapshot)) {
			throw new ComparisonEvidenceError(
				`case ${benchmarkCase.caseId} arm ${role} field inputs.files.corpus differs from case ${reference.caseId}`,
			);
		}
	}
}

export function assertComparableComparison(
	cases: readonly Immutable<ComparisonCaseEvidence>[],
): ComparisonContract {
	const [firstCase] = cases;
	if (firstCase === undefined) {
		throw new ComparisonEvidenceError(
			"case manifest arm all field cases requires at least one case",
		);
	}

	const referenceArm = firstCase.arms.baseline;
	if (cases.length < 2 && referenceArm.group.record.mode === "pipeline") {
		throw new ComparisonEvidenceError(
			`case manifest arm all field cases requires at least two cases in ${referenceArm.group.record.mode} mode`,
		);
	}

	for (const benchmarkCase of cases) {
		for (const role of COMPARISON_ARMS) {
			const arm = benchmarkCase.arms[role];
			assertContract({
				caseId: benchmarkCase.caseId,
				arm,
				referenceCaseId: firstCase.caseId,
				referenceArm,
			});
			assertArmRanTheCase(benchmarkCase.caseId, arm);
			assertExpectedRepCount(benchmarkCase.caseId, arm);
		}
		assertControlledInputs({
			caseId: benchmarkCase.caseId,
			reference: benchmarkCase.arms.baseline,
			other: benchmarkCase.arms.candidate,
		});
		assertControlledInputs({
			caseId: benchmarkCase.caseId,
			reference: benchmarkCase.arms.baseline,
			other: benchmarkCase.arms.control,
		});
	}

	for (const role of COMPARISON_ARMS) {
		assertArmCorpusSnapshot(cases, role);
	}

	return {
		mode: referenceArm.group.record.mode,
		declaredStages: referenceArm.group.record.declaredStages,
		reps: armReps(referenceArm),
	};
}

export interface ComparableComparison {
	readonly cases: readonly ComparisonCaseEvidence[];
	readonly contract: ComparisonContract;
}

function groupDifference(
	caseId: string,
	reference: Immutable<ComparisonArmEvidence>,
	other: Immutable<ComparisonArmEvidence>,
): string | undefined {
	if (reference.group.record.mode !== other.group.record.mode) {
		return "mode";
	}
	if (
		!sameValue(
			reference.group.record.declaredStages,
			other.group.record.declaredStages,
		)
	) {
		return "declaredStages";
	}
	const controlled = controlledInputDifference({ caseId, reference, other });
	if (controlled !== undefined) {
		return controlled;
	}
	if (
		!sameValue(
			sortedFiles(reference.executedCorpus),
			sortedFiles(other.executedCorpus),
		)
	) {
		return "inputs.files.corpus";
	}

	return undefined;
}

/**
 * Reads an arm's groups as one arm. Every group must have run the arm's
 * variant on the first group's inputs and corpus, or its attempts would
 * answer another question than the arm's.
 */
function mergeArm(
	caseId: string,
	groups: LoadedComparisonArmGroups,
): ComparisonArmEvidence {
	const [first, ...rest] = groups;
	const reference = projectArm(caseId, first);
	const others = rest.map((group) => projectArm(caseId, group));
	const named = new Set([reference.group.record.groupId]);
	for (const other of others) {
		if (named.has(other.group.record.groupId)) {
			throw new ComparisonEvidenceError(
				`case ${caseId} arm ${other.role} group ${other.group.path} is named twice`,
			);
		}
		named.add(other.group.record.groupId);
		assertArmRanTheCase(caseId, other);
		const field = groupDifference(caseId, reference, other);
		if (field !== undefined) {
			throw new ComparisonEvidenceError(
				`case ${caseId} arm ${other.role} group ${other.group.path} field ${field} differs from group ${reference.group.path}`,
			);
		}
	}
	if (others.length === 0) {
		return reference;
	}

	return {
		...reference,
		groups: [reference, ...others].map(({ group }) => group),
		reps: [reference, ...others].flatMap(({ reps }) => reps),
		sourcePaths: [reference, ...others].flatMap(
			({ sourcePaths }) => sourcePaths,
		),
	};
}

export function buildComparableComparison(
	loadedCases: readonly LoadedComparisonCaseEvidence[],
): ComparableComparison {
	const cases = loadedCases.map((benchmarkCase) => ({
		caseId: benchmarkCase.caseId,
		arms: {
			baseline: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.baseline),
			candidate: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.candidate),
			control: mergeArm(benchmarkCase.caseId, benchmarkCase.arms.control),
		},
	}));

	return { cases, contract: assertComparableComparison(cases) };
}
