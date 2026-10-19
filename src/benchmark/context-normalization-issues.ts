import type { ContextEvidence } from "./context-evidence-contract";
import { numberValue } from "./context-evidence-values";
import type { JsonObject } from "./json-value";

type NormalizationIssue =
	ContextEvidence["projection"]["normalizationIssues"][number];

interface NormalizationIssues {
	readonly values: readonly NormalizationIssue[];
	readonly add: (issue: NormalizationIssue) => void;
}

function normalizationIssueCollection(): NormalizationIssues {
	const values: NormalizationIssue[] = [];

	return {
		add: (issue) => {
			values.push(issue);
		},
		values,
	};
}

interface ObservedNormalizationIssue {
	readonly stream: string;
	readonly record: Readonly<JsonObject>;
	readonly detail: string;
}

function recordNormalizationIssue(
	issues: Readonly<NormalizationIssues>,
	{ stream, record, detail }: ObservedNormalizationIssue,
): void {
	issues.add({
		code: "malformed-recognized-record",
		detail,
		sourceOrdinal: numberValue(record, "capture_ordinal") ?? null,
		stream,
	});
}

export { normalizationIssueCollection, recordNormalizationIssue };
export type { NormalizationIssues };
