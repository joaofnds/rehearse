import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { liveCorpusSource } from "#benchmark/corpus-file";
import type { ClaudeRunner } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";
import verboseOutput from "#benchmark/session-output-test-fixtures";

const OPTION_VALUE_POSITION_OFFSET = 1;

/**
 * The provider writes its session file under the id the command line named,
 * which is what lets the harness account for the file it must remove.
 */
function fakeClaude(
	projects: string,
	reply: string,
	init?: string,
): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId =
			command[command.indexOf("--session-id") + OPTION_VALUE_POSITION_OFFSET] ??
			"";
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${JSON.stringify({
				message: { content: [{ text: reply, type: "text" }] },
				type: "assistant",
			})}\n`,
		);

		return fakeClaudeEnvelope(sessionId, reply, init);
	};
}
const DIAGNOSTIC_TRANSCRIPT = [
	{
		message: {
			content: [
				{
					id: "bash-1",
					input: { command: "ls" },
					name: "Bash",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
	{
		message: {
			content: [{ tool_use_id: "bash-1", type: "tool_result" }],
		},
		type: "user",
	},
	{
		message: {
			content: [
				{
					id: "read-1",
					input: { file_path: "/tmp/x.md" },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
	{
		message: {
			content: [{ tool_use_id: "read-1", type: "tool_result" }],
		},
		type: "user",
	},
	{
		message: {
			content: [
				{
					id: "bash-2",
					input: { command: "ls" },
					name: "Bash",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
	{
		message: {
			content: [{ is_error: true, tool_use_id: "bash-2", type: "tool_result" }],
		},
		type: "user",
	},
	{
		message: {
			content: [
				{
					id: "bash-3",
					input: { command: "ls " },
					name: "Bash",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	},
	{
		message: {
			content: [{ tool_use_id: "bash-3", type: "tool_result" }],
		},
		type: "user",
	},
	{
		message: { content: [{ text: "OK", type: "text" }] },
		type: "assistant",
	},
];

function diagnosticClaude(projects: string): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId =
			command[command.indexOf("--session-id") + OPTION_VALUE_POSITION_OFFSET] ??
			"";
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		const blocks = DIAGNOSTIC_TRANSCRIPT;
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${blocks.map((block) => JSON.stringify(block)).join("\n")}\n`,
		);

		return fakeClaudeEnvelope(sessionId, "OK");
	};
}

function fakeClaudeEnvelope(
	sessionId: string,
	reply: string,
	init?: string,
): string {
	const result = JSON.stringify({
		duration_api_ms: 700,
		duration_ms: 800,
		is_error: false,
		num_turns: 1,
		result: reply,
		session_id: sessionId,
		total_cost_usd: 0.0011,
		type: "result",
		usage: {
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 10,
			output_tokens: 2,
		},
	});

	return verboseOutput(result, init);
}
interface RecordedSkillCall {
	readonly id: string;
	readonly input: { readonly skill: string };
	readonly name: "Skill";
	readonly type: "tool_use";
}
interface RecordedSkillText {
	readonly text: string;
	readonly type: "text";
}
interface RecordedSkillTranscriptEntry {
	readonly isMeta?: true;
	readonly message: {
		readonly content: readonly (RecordedSkillCall | RecordedSkillText)[];
	};
	readonly type: "assistant" | "user";
}
function undeclaredSkillTranscript(): readonly RecordedSkillTranscriptEntry[] {
	return [
		{
			message: {
				content: [
					{
						id: "toolu_skill",
						input: { skill: "verify" },
						name: "Skill",
						type: "tool_use",
					},
				],
			},
			type: "assistant",
		},
		{
			isMeta: true,
			message: {
				content: [
					{
						text: `Base directory for this skill: ${liveCorpusSource().root}/skills/verify`,
						type: "text",
					},
				],
			},
			type: "user",
		},
		{
			message: { content: [{ text: "OK", type: "text" }] },
			type: "assistant",
		},
	];
}
function undeclaredSkillClaude(projects: string): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId =
			command[command.indexOf("--session-id") + OPTION_VALUE_POSITION_OFFSET] ??
			"";
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${undeclaredSkillTranscript()
				.map((record) => JSON.stringify(record))
				.join("\n")}\n`,
		);

		return verboseOutput(
			JSON.stringify({
				duration_api_ms: 700,
				duration_ms: 800,
				is_error: false,
				num_turns: 1,
				result: "OK",
				session_id: sessionId,
				total_cost_usd: 0.0011,
				type: "result",
				usage: {
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 0,
					input_tokens: 10,
					output_tokens: 2,
				},
			}),
		);
	};
}
export { diagnosticClaude, fakeClaude, undeclaredSkillClaude };
