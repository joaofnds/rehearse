import type { z } from "zod";

import type { Immutable } from "./contracts";
import type {
	TranscriptLocation,
	diagnosticIssueSchema,
} from "./transcript-diagnostics-contract";
import type { LocatedDiagnosticIssue } from "./transcript-line-contract";

const PREFIX_START_INDEX = 0;

const MAX_ISSUE_LOCATIONS = 20;

function summarizeIssues(
	issues: Immutable<readonly LocatedDiagnosticIssue[]>,
): z.infer<typeof diagnosticIssueSchema>[] {
	const grouped = new Map<
		LocatedDiagnosticIssue["kind"],
		TranscriptLocation[]
	>();
	for (const issue of issues) {
		const locations = grouped.get(issue.kind) ?? [];
		locations.push(issue.location);
		grouped.set(issue.kind, locations);
	}

	return [...grouped].map(([kind, locations]) => ({
		kind,
		locations: locations.slice(PREFIX_START_INDEX, MAX_ISSUE_LOCATIONS),
		locationsTruncated: locations.length > MAX_ISSUE_LOCATIONS,
		occurrences: locations.length,
	}));
}

export { summarizeIssues as default };
