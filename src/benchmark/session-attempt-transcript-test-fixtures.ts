import { WRITTEN_SESSION } from "./session-attempt-case-test-fixtures";
import type { TranscriptDiagnostics } from "./transcript";

function envelope(result: string): string {
	return JSON.stringify({
		duration_api_ms: 800,
		duration_ms: 900,
		is_error: false,
		num_turns: 1,
		result,
		session_id: WRITTEN_SESSION,
		subtype: "success",
		total_cost_usd: 0.0012,
		type: "result",
		usage: {
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 12,
			output_tokens: 3,
		},
	});
}

function transcriptLine(sessionId: string, text: string): string {
	return JSON.stringify({
		message: { content: [{ text, type: "text" }] },
		sessionId,
		type: "assistant",
	});
}

function toolUseLine(sessionId: string): string {
	return JSON.stringify({
		message: {
			content: [{ input: {}, name: "Bash", type: "tool_use" }],
		},
		sessionId,
		type: "assistant",
	});
}

function bashToolUseLine(
	sessionId: string,
	id: string,
	command: string,
): string {
	return JSON.stringify({
		message: {
			content: [{ id, input: { command }, name: "Bash", type: "tool_use" }],
		},
		sessionId,
		type: "assistant",
	});
}

function toolResultLine(id: string, isError = false): string {
	return JSON.stringify({
		message: {
			content: [{ is_error: isError, tool_use_id: id, type: "tool_result" }],
		},
		type: "user",
	});
}

function readFileLine(sessionId: string, filePath: string): string {
	return JSON.stringify({
		message: {
			content: [
				{ input: { file_path: filePath }, name: "Read", type: "tool_use" },
			],
		},
		sessionId,
		type: "assistant",
	});
}

function skillBodyLine(
	sessionId: string,
	skill: string,
	directory = "/tmp/rehearse-attempt",
): string {
	return JSON.stringify({
		isMeta: true,
		message: {
			content: [
				{
					text: `Base directory for this skill: ${directory}/.claude/skills/${skill}\n\nReply OK.`,
					type: "text",
				},
			],
		},
		sessionId,
		type: "user",
	});
}

function outputStyleLine(style: string): string {
	return JSON.stringify({
		attachment: { style, type: "output_style" },
		type: "attachment",
	});
}

function agentResultLine(sessionId: string, agentId: string): string {
	return JSON.stringify({
		message: {
			content: [
				{ content: "", tool_use_id: `toolu_${agentId}`, type: "tool_result" },
			],
		},
		sessionId,
		toolUseResult: { agentId, isAsync: true, status: "async_launched" },
		type: "user",
	});
}

function forkedSkillResultLine(sessionId: string, agentId: string): string {
	return JSON.stringify({
		message: {
			content: [
				{ content: "", tool_use_id: `toolu_${agentId}`, type: "tool_result" },
			],
		},
		sessionId,
		toolUseResult: {
			agentId,
			commandName: "code-review",
			status: "forked",
			success: true,
		},
		type: "user",
	});
}

const POST_CUT_BASH_DIAGNOSTICS: TranscriptDiagnostics = {
	issues: [],
	measuredLineCount: 3,
	prefixLinesExcluded: 2,
	repeatedBashCommands: [],
	sourceLineCount: 6,
	state: "complete",
	toolErrors: [
		{
			call: { block: 1, line: 4 },
			result: { block: 1, line: 5 },
			toolName: "Bash",
			toolUseId: "bash-1",
		},
	],
	toolUseOccurrences: {
		byName: [{ count: 1, name: "Bash" }],
		total: 1,
	},
};

export {
	POST_CUT_BASH_DIAGNOSTICS,
	envelope,
	transcriptLine,
	toolUseLine,
	bashToolUseLine,
	toolResultLine,
	readFileLine,
	skillBodyLine,
	outputStyleLine,
	agentResultLine,
	forkedSkillResultLine,
};
