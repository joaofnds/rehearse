import { describe, expect, it } from "bun:test";

import { parseTranscript, transcriptDiagnostics } from "#benchmark/transcript";

import {
	ambiguousIdentitiesExpected,
	invalidToolsExpected,
	missingIdentitiesExpected,
} from "./transcript-identity-diagnostic-fixtures";
import {
	assistantWith,
	bashCall,
	line,
	readCall,
	toolResult,
} from "./transcript-test-fixtures";

function keepsAmbiguousIdentitiesPartialAndOutOfRepeatedCommandGroups(): void {
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("duplicate", "pwd"), bashCall("duplicate", "pwd")),
			line({
				message: {
					content: [
						toolResult("duplicate", true),
						toolResult("unmatched", true),
					],
				},
				type: "user",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(ambiguousIdentitiesExpected);
}

function doesNotFabricateJoinsOrRepeatsFromMissingToolIdentities(): void {
	const transcript = parseTranscript(
		[
			assistantWith(
				{ input: { command: "pwd" }, name: "Bash", type: "tool_use" },
				{ input: { command: "pwd" }, name: "Bash", type: "tool_use" },
			),
			line({
				message: {
					content: [{ is_error: true, type: "tool_result" }],
				},
				type: "user",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(missingIdentitiesExpected);
}

function namesInvalidToolBlocksAndDuplicateResultIdentities(): void {
	const transcript = parseTranscript(
		[
			assistantWith({
				id: "invalid-use",
				input: "not an object",
				name: "Bash",
				type: "tool_use",
			}),
			line({
				message: {
					content: [
						{
							is_error: "yes",
							tool_use_id: "invalid-result",
							type: "tool_result",
						},
					],
				},
				type: "user",
			}),
			assistantWith(readCall("read-1")),
			line({
				message: {
					content: [toolResult("read-1"), toolResult("read-1")],
				},
				type: "user",
			}),
		].join("\n"),
	);

	expect(
		transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		}),
	).toEqual(invalidToolsExpected);
}

describe(transcriptDiagnostics.name, () => {
	it(
		"keeps ambiguous identities partial and out of repeated-command groups",
		keepsAmbiguousIdentitiesPartialAndOutOfRepeatedCommandGroups,
	);
	it(
		"does not fabricate joins or repeats from missing tool identities",
		doesNotFabricateJoinsOrRepeatsFromMissingToolIdentities,
	);
	it(
		"names invalid tool blocks and duplicate result identities",
		namesInvalidToolBlocksAndDuplicateResultIdentities,
	);
});
