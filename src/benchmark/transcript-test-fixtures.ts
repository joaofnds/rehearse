import type { JsonValue } from "#benchmark/json-value";

import { parseTranscript, transcriptDiagnostics } from "./transcript";
import type { TranscriptDiagnostics } from "./transcript-diagnostics-contract";

function line(record: JsonValue): string {
	return JSON.stringify(record);
}

function assistantWith(...blocks: readonly JsonValue[]): string {
	return line({ message: { content: blocks }, type: "assistant" });
}

function toolResult(id: string, isError = false): JsonValue {
	return {
		content: "result",
		is_error: isError,
		tool_use_id: id,
		type: "tool_result",
	};
}

function bashCall(id: string, command: string): JsonValue {
	return { id, input: { command }, name: "Bash", type: "tool_use" };
}

function readCall(id: string): JsonValue {
	return {
		id,
		input: { file_path: "/tmp/x.md" },
		name: "Read",
		type: "tool_use",
	};
}

const readBlock = {
	id: "toolu_1",
	input: { file_path: "/tmp/x.md" },
	name: "Read",
	type: "tool_use",
};

const bashBlock = {
	id: "toolu_2",
	input: { command: "ls" },
	name: "Bash",
	type: "tool_use",
};

const skillBlock = {
	id: "toolu_3",
	input: { skill: "verify" },
	name: "Skill",
	type: "tool_use",
};

const skillBody = {
	text: "Base directory for this skill: /tmp/attempt/.claude/skills/verify\n\nReply with the token.",
	type: "text",
};

function userWith(...blocks: readonly JsonValue[]): string {
	return line({ message: { content: blocks }, type: "user" });
}

function metaUserWith(...blocks: readonly JsonValue[]): string {
	return line({ isMeta: true, message: { content: blocks }, type: "user" });
}

function attachmentLine(attachment: JsonValue): string {
	return line({ attachment, type: "attachment" });
}

function repeatedDiagnosticsFixture(): RepeatedDiagnosticsFixture {
	const transcript = parseTranscript(
		[
			assistantWith(bashCall("bash-1", "pwd")),
			line({
				message: { content: [toolResult("bash-1")] },
				type: "user",
			}),
			assistantWith(bashCall("bash-2", "pwd")),
			line({
				message: { content: [toolResult("bash-2")] },
				type: "user",
			}),
		].join("\n"),
	);

	const complete = transcriptDiagnostics({
		lines: transcript,
		prefixLinesExcluded: 0,
		sourceAvailable: true,
	});

	if (complete.state !== "complete") {
		throw new Error("Expected complete transcript diagnostics");
	}

	const [repeat] = complete.repeatedBashCommands;

	if (repeat === undefined) {
		throw new Error("Expected repeated Bash command evidence");
	}
	return { complete, repeat };
}

interface RepeatedDiagnosticsFixture {
	readonly complete: Extract<TranscriptDiagnostics, { state: "complete" }>;
	readonly repeat: Extract<
		TranscriptDiagnostics,
		{ state: "complete" }
	>["repeatedBashCommands"][number];
}

export {
	line,
	assistantWith,
	toolResult,
	bashCall,
	readCall,
	readBlock,
	bashBlock,
	skillBlock,
	skillBody,
	userWith,
	metaUserWith,
	attachmentLine,
	repeatedDiagnosticsFixture,
};
