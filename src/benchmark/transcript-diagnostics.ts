import type { Immutable } from "./contracts";
import summarizeIssues from "./transcript-diagnostic-issues";
import { transcriptDiagnosticsSchema } from "./transcript-diagnostics-contract";
import type { TranscriptDiagnostics } from "./transcript-diagnostics-contract";
import type {
	LocatedDiagnosticIssue,
	LocatedToolResult,
	LocatedToolUse,
	TranscriptLine,
} from "./transcript-line-contract";
import repeatedBashCommands from "./transcript-repeated-commands";
import { groupByToolUseId, joinIssues } from "./transcript-tool-joins";
import { countToolUses, observedErrors } from "./transcript-tool-observations";

const FIRST_POST_PREFIX_LINE_OFFSET = 1;

const FINAL_TRANSCRIPT_LINE_OFFSET = -1;
const NO_TRANSCRIPT_LINE_NUMBER = 0;
const EMPTY_COLLECTION_LENGTH = 0;
const FIRST_TRANSCRIPT_LINE_NUMBER = 1;

interface TranscriptDiagnosticsInput {
	readonly lines: Immutable<readonly TranscriptLine[]>;
	readonly prefixLinesExcluded: number;
	readonly sourceAvailable: boolean;
}

function transcriptDiagnostics(
	input: Readonly<TranscriptDiagnosticsInput>,
): TranscriptDiagnostics {
	if (!input.sourceAvailable) {
		return {
			prefixLinesExcluded: input.prefixLinesExcluded,
			state: "unavailable",
		};
	}
	const measured = measureTranscript(input);
	return diagnoseTranscript(measured, input.prefixLinesExcluded);
}

interface MeasuredTranscript {
	readonly sourceLineCount: number;
	readonly measuredLineCount: number;
	readonly uses: Immutable<readonly LocatedToolUse[]>;
	readonly results: Immutable<readonly LocatedToolResult[]>;
	readonly issues: readonly LocatedDiagnosticIssue[];
}

function measureTranscript(
	input: Readonly<TranscriptDiagnosticsInput>,
): MeasuredTranscript {
	const sourceLineCount =
		input.lines.at(FINAL_TRANSCRIPT_LINE_OFFSET)?.line ??
		NO_TRANSCRIPT_LINE_NUMBER;
	const measured = input.lines.slice(input.prefixLinesExcluded);
	const uses = measured.flatMap(({ locatedToolUses }) => locatedToolUses);
	const results = measured.flatMap(
		({ locatedToolResults }) => locatedToolResults,
	);
	const issues = measured.flatMap(({ diagnosticIssues }) => diagnosticIssues);
	if (measured.length === EMPTY_COLLECTION_LENGTH) {
		issues.push({
			kind: "empty-measured-transcript",
			location: {
				block: 1,
				line: Math.max(
					FIRST_TRANSCRIPT_LINE_NUMBER,
					input.prefixLinesExcluded + FIRST_POST_PREFIX_LINE_OFFSET,
				),
			},
		});
	}

	return {
		issues,
		measuredLineCount: measured.length,
		results,
		sourceLineCount,
		uses,
	};
}

function diagnoseTranscript(
	{
		uses,
		results,
		issues: measuredIssues,
		sourceLineCount,
		measuredLineCount,
	}: MeasuredTranscript,
	prefixLinesExcluded: number,
): TranscriptDiagnostics {
	const issues = [...measuredIssues];
	const groupedUses = groupByToolUseId(
		uses,
		"missing-tool-use-id",
		"duplicate-tool-use-id",
	);
	const groupedResults = groupByToolUseId(
		results,
		"missing-tool-result-id",
		"duplicate-tool-result",
	);
	const joiningIssues = joinIssues(groupedUses.byId, groupedResults.byId);
	const repeated = repeatedBashCommands(uses, groupedUses.byId);
	issues.push(
		...groupedUses.issues,
		...groupedResults.issues,
		...joiningIssues,
		...repeated.issues,
	);

	const observations = {
		issues: summarizeIssues(issues),
		measuredLineCount,
		prefixLinesExcluded,
		repeatedBashCommands: repeated.commands,
		sourceLineCount,
		toolErrors: observedErrors(results, groupedUses.byId),
		toolUseOccurrences: countToolUses(uses),
	};

	return transcriptDiagnosticsSchema.parse({
		state:
			observations.issues.length === EMPTY_COLLECTION_LENGTH
				? "complete"
				: "partial",
		...observations,
	});
}

export { transcriptDiagnostics as default };

export type { TranscriptDiagnosticsInput };
