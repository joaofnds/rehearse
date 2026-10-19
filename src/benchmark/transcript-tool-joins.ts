import type { Immutable } from "./contracts";
import type {
	DiagnosticGrouping,
	LocatedDiagnosticIssue,
	LocatedToolIdentity,
	LocatedToolResultMap,
	LocatedToolUseMap,
} from "./transcript-line-contract";

const SINGLE_ITEM_COUNT = 1;

function groupByToolUseId<Entry extends Immutable<LocatedToolIdentity>>(
	entries: readonly Entry[],
	missingKind: LocatedDiagnosticIssue["kind"],
	duplicateKind: LocatedDiagnosticIssue["kind"],
): DiagnosticGrouping<Entry> {
	const grouped = new Map<string, Entry[]>();
	const issues: LocatedDiagnosticIssue[] = [];
	for (const entry of entries) {
		if (entry.toolUseId === undefined) {
			issues.push({ kind: missingKind, location: entry.location });
		} else {
			const occurrences = grouped.get(entry.toolUseId) ?? [];
			occurrences.push(entry);
			grouped.set(entry.toolUseId, occurrences);
		}
	}
	issues.push(...duplicateOccurrences(grouped, duplicateKind));

	return { byId: grouped, issues };
}

function joinIssues(
	usesById: LocatedToolUseMap,
	resultsById: LocatedToolResultMap,
): readonly LocatedDiagnosticIssue[] {
	const issues: LocatedDiagnosticIssue[] = [];
	for (const [id, uses] of usesById) {
		if (!resultsById.has(id)) {
			issues.push(
				...uses.map(({ location }) => ({
					kind: "missing-tool-result" as const,
					location,
				})),
			);
		}
	}
	for (const [id, results] of resultsById) {
		if (!usesById.has(id)) {
			issues.push(
				...results.map(({ location }) => ({
					kind: "unmatched-tool-result" as const,
					location,
				})),
			);
		}
	}

	return issues;
}

function duplicateOccurrences<Entry extends Immutable<LocatedToolIdentity>>(
	grouped: ReadonlyMap<string, readonly Entry[]>,
	duplicateKind: LocatedDiagnosticIssue["kind"],
): readonly LocatedDiagnosticIssue[] {
	const issues: LocatedDiagnosticIssue[] = [];
	for (const occurrences of grouped.values()) {
		if (occurrences.length > SINGLE_ITEM_COUNT) {
			issues.push(
				...occurrences.map(({ location }) => ({
					kind: duplicateKind,
					location,
				})),
			);
		}
	}
	return issues;
}

export { groupByToolUseId, joinIssues };
