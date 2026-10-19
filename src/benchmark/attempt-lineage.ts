import type { Attempt, AttemptLineageInputs } from "./attempt-contract";
import LineageMismatchError from "./attempt-contract";
import type { CorpusDifferenceWording } from "./checkpoint";
import { corpusDifferences } from "./checkpoint";

const LEADING_ATTEMPT_LABEL_COUNT = 1;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * Neither attempt is the authority here, unlike staleness where the record
 * is compared against the present, so a file only one of them read is named
 * without saying which side lacked it.
 */
const COMPARISON_WORDING: CorpusDifferenceWording = {
	missingFromLeft: (path) => `${path} present in one attempt only`,
	missingFromRight: (path) => `${path} present in one attempt only`,
	modified: (path) => `${path} differs`,
};

/**
 * A model or effort change makes two grades measure different things; there
 * is no reading of that disagreement worth presenting, so it stays a refusal.
 */
function executionDifferences(
	reference: AttemptLineageInputs,
	other: AttemptLineageInputs,
): string[] {
	const differences: string[] = [];
	if (reference.model !== other.model) {
		differences.push(`model ${reference.model} against ${other.model}`);
	}
	if (reference.effort !== other.effort) {
		differences.push(
			`effort ${reference.effort ?? "none"} against ${other.effort ?? "none"}`,
		);
	}

	return differences.toSorted();
}

type LabelledAttempt = Attempt & { lineageInputs: AttemptLineageInputs };

interface LineagePair {
	readonly reference: LabelledAttempt;
	readonly other: LabelledAttempt;
}

/**
 * Every other labelled attempt paired with the reference it is compared
 * against. Attempts recorded before lineage inputs existed carry none and
 * are excluded, because refusing or annotating them would break reading of
 * every earlier run. There is nothing to pair when fewer than two attempts
 * carry lineage inputs.
 */
function lineagePairs(attempts: readonly Attempt[]): readonly LineagePair[] {
	const labelled = attempts.filter(
		(attempt): attempt is LabelledAttempt =>
			attempt.lineageInputs !== undefined,
	);
	const [reference] = labelled;
	if (!reference) {
		return [];
	}

	return labelled
		.slice(LEADING_ATTEMPT_LABEL_COUNT)
		.map((other) => ({ other, reference }));
}

/**
 * A model or effort change still voids the comparison, unchanged from
 * before.
 */
function assertComparableLineages(attempts: readonly Attempt[]): void {
	for (const { reference, other } of lineagePairs(attempts)) {
		const differences = executionDifferences(
			reference.lineageInputs,
			other.lineageInputs,
		);
		if (differences.length > EMPTY_COLLECTION_LENGTH) {
			throw new LineageMismatchError(
				`Cannot compare ${reference.label} with ${other.label}: they consumed different inputs (${differences.join("; ")})`,
			);
		}
	}
}

interface AttributedCorpusDifference {
	readonly label: string;
	readonly differences: readonly string[];
}

/**
 * A corpus edit between two attempts is the comparison's subject, not a
 * reason to refuse it; the differing files are named in the presentation,
 * against the attempt that carries them, so two replays editing the same
 * file are not collapsed into one indistinguishable line.
 */
function corpusLineageDifferences(
	attempts: readonly Attempt[],
): readonly AttributedCorpusDifference[] {
	const lines: AttributedCorpusDifference[] = [];
	for (const { reference, other } of lineagePairs(attempts)) {
		const differences = corpusDifferences(
			reference.lineageInputs.corpusFiles,
			other.lineageInputs.corpusFiles,
			COMPARISON_WORDING,
		);
		if (differences.length > EMPTY_COLLECTION_LENGTH) {
			lines.push({ differences, label: other.label });
		}
	}

	return lines;
}
export { assertComparableLineages, corpusLineageDifferences };
