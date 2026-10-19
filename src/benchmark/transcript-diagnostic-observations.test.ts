import { describe, expect, it } from "bun:test";

import { parseTranscript, transcriptDiagnostics } from "#benchmark/transcript";

import { measuredDiagnosticsExpected } from "./transcript-command-diagnostic-fixtures";
import {
	assistantWith,
	bashCall,
	line,
	readCall,
	toolResult,
} from "./transcript-test-fixtures";

function reportsPostPrefixToolOccurrencesErrorsAndExactRepeatedBashInputs(): void {
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("prefix", "ls")),
			line({ message: { content: [toolResult("prefix")] }, type: "user" }),
			assistantWith(bashCall("bash-1", "ls")),
			line({ message: { content: [toolResult("bash-1")] }, type: "user" }),
			assistantWith(readCall("read-1")),
			line({ message: { content: [toolResult("read-1")] }, type: "user" }),
			assistantWith(bashCall("bash-2", "ls")),
			line({
				message: { content: [toolResult("bash-2", true)] },
				type: "user",
			}),
			assistantWith(bashCall("bash-3", "ls ")),
			line({ message: { content: [toolResult("bash-3")] }, type: "user" }),
		].join("\n"),
	);

	const diagnostics = transcriptDiagnostics({
		lines: transcript,
		prefixLinesExcluded: 2,
		sourceAvailable: true,
	});

	expect(diagnostics).toEqual(measuredDiagnosticsExpected);
}

function distinguishesCompleteZeroObservationsFromUnavailableEvidence(): void {
	const transcript = parseTranscript(
		[
			line({ message: { content: "hello" }, type: "user" }),
			line({ operation: "enqueue", type: "queue-operation" }),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual({
		issues: [],
		measuredLineCount: 2,
		prefixLinesExcluded: 0,
		repeatedBashCommands: [],
		sourceLineCount: 2,
		state: "complete",
		toolErrors: [],
		toolUseOccurrences: { byName: [], total: 0 },
	});
	expect(
		transcriptDiagnostics({
			lines: [],
			prefixLinesExcluded: 7,
			sourceAvailable: false,
		}),
	).toEqual({
		prefixLinesExcluded: 7,
		state: "unavailable",
	});
}

describe(transcriptDiagnostics.name, () => {
	it(
		"reports post-prefix tool occurrences, errors, and exact repeated Bash inputs",
		reportsPostPrefixToolOccurrencesErrorsAndExactRepeatedBashInputs,
	);
	it(
		"distinguishes complete zero observations from unavailable evidence",
		distinguishesCompleteZeroObservationsFromUnavailableEvidence,
	);
});
