import type { SessionCaseDeclaration } from "./case";
import type { ComparisonArmEvidence, FrozenFile } from "./comparison-evidence";
import ComparisonEvidenceError from "./comparison-evidence";
import type { Immutable } from "./contracts";

const CORPUS_FILE_INDEX_STEP = 1;

interface ControlledInputComparison {
	readonly caseId: string;
	readonly reference: ComparisonArmEvidence;
	readonly other: ComparisonArmEvidence;
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
	for (let index = 0; index < maximum; index += CORPUS_FILE_INDEX_STEP) {
		const leftFile = leftFiles[index];
		const rightFile = rightFiles[index];
		if (!sameValue(leftFile, rightFile)) {
			const file = leftFile ?? rightFile;

			return file === undefined
				? "inputs.files"
				: `inputs.files.${file.kind}:${file.path}`;
		}
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

/**
 * Every recorded session attempt before the actual setup ran isolated, so an
 * attempt that records no setup reads as isolated. A stage group that records
 * no setup ran before groups recorded one, with project settings alone from
 * 2026-09-04, every setting source before that, or for a short window on
 * 2026-10-30 the actual setup. Nothing in the group tells these apart, so it
 * reads as project, which never matches a group that records actual.
 */
function setupKinds(arm: Immutable<ComparisonArmEvidence>): string {
	const group = arm.group.record;
	if (group.mode !== "session") {
		return group.inputs.setup ?? "project";
	}

	const kinds = arm.reps.map(
		({ attempt }) => attempt?.record.setup?.kind ?? "isolated",
	);

	return [...new Set(kinds)].toSorted().join(",");
}

/**
 * Which delivery rule placed the arm's corpus. A record made before delivery
 * has none, and its home-path citations read the live install, so it never
 * matches an arm whose citations read its own copy. The redirect count is the
 * arm's own text and differs freely between arms of one rule.
 */
function deliveryRules(arm: Immutable<ComparisonArmEvidence>): string {
	const group = arm.group.record;
	if (group.mode !== "session") {
		return String(group.inputs.corpusDelivery?.rule ?? "none");
	}

	const rules = arm.reps.map(({ attempt }) =>
		String(attempt?.record.corpusDelivery?.rule ?? "none"),
	);

	return [...new Set(rules)].toSorted().join(",");
}

function setupDifference(
	comparison: Immutable<ControlledInputComparison>,
): string | undefined {
	if (setupKinds(comparison.reference) !== setupKinds(comparison.other)) {
		return "setup";
	}

	return deliveryRules(comparison.reference) === deliveryRules(comparison.other)
		? undefined
		: "corpusDelivery";
}

function sessionInputDifference(
	comparison: Immutable<ControlledInputComparison>,
): string | undefined {
	const caseDifference = sessionCaseDifference(
		comparison.reference.sessionCase,
		comparison.other.sessionCase,
	);
	if (caseDifference !== undefined) {
		return caseDifference;
	}
	const fileDifference = controlledFileDifference(
		comparison.reference.controlledFiles.filter(({ kind }) => kind !== "case"),
		comparison.other.controlledFiles.filter(({ kind }) => kind !== "case"),
	);
	if (fileDifference !== undefined) {
		return fileDifference;
	}
	const reference = comparison.reference.group.record.inputs;
	const other = comparison.other.group.record.inputs;
	return [
		{ differs: reference.model !== other.model, field: "inputs.model" },
		{ differs: reference.effort !== other.effort, field: "inputs.effort" },
		{
			differs: reference.sessionBudgetUsd !== other.sessionBudgetUsd,
			field: "inputs.sessionBudgetUsd",
		},
	].find(({ differs }) => differs)?.field;
}

function stageInputDifference(
	comparison: Immutable<ControlledInputComparison>,
): string | undefined {
	const fileDifference = controlledFileDifference(
		comparison.reference.controlledFiles,
		comparison.other.controlledFiles,
	);
	if (fileDifference !== undefined) {
		return fileDifference;
	}
	const reference = comparison.reference.group.record.inputs;
	const other = comparison.other.group.record.inputs;
	return [
		{
			differs: !sameValue(reference.lineage, other.lineage),
			field: "inputs.lineage",
		},
		{ differs: reference.model !== other.model, field: "inputs.model" },
		{ differs: reference.effort !== other.effort, field: "inputs.effort" },
		{
			differs: reference.judgeModel !== other.judgeModel,
			field: "inputs.judgeModel",
		},
		{
			differs: reference.judgeEffort !== other.judgeEffort,
			field: "inputs.judgeEffort",
		},
		{
			differs: reference.sessionBudgetUsd !== other.sessionBudgetUsd,
			field: "inputs.sessionBudgetUsd",
		},
		{
			differs: reference.pipelinePath !== other.pipelinePath,
			field: "inputs.pipelinePath",
		},
	].find(({ differs }) => differs)?.field;
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
		return setupDifference(comparison) ?? sessionInputDifference(comparison);
	}
	return setupDifference(comparison) ?? stageInputDifference(comparison);
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

export {
	assertControlledInputs,
	controlledInputDifference,
	deliveryRules,
	sameValue,
	setupKinds,
	sortedFiles,
};
