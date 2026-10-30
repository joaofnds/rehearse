import {
	mkdir,
	readFile,
	readdir,
	realpath,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import {
	envelope,
	transcriptLine,
} from "./session-attempt-transcript-test-fixtures";

const MISSING_OPTION_INDEX = -1;

const OPTION_VALUE_POSITION_OFFSET = 1;

const FIRST_RECORDED_PROVIDER_RUN_INDEX = 0;

const SECOND_SHELL_OUTPUT_INDEX = 1;

const MISSING_SEQUENCE_INDEX = -1;

const NEXT_SEQUENCE_ELEMENT_OFFSET = 1;

function valueAfter(
	flags: readonly string[],
	flag: string,
): string | undefined {
	const index = flags.indexOf(flag);

	return index === MISSING_SEQUENCE_INDEX
		? undefined
		: flags[index + NEXT_SEQUENCE_ELEMENT_OFFSET];
}

interface FakeRun {
	readonly command: readonly string[];
	readonly cwd: string;
	readonly seenFiles: readonly string[];
	readonly shellOutputs: readonly string[];
	/** The settings JSON the session reads, from the file --settings names or inline. */
	readonly settingsText: string | undefined;
}

async function settingsText(
	command: readonly string[],
): Promise<string | undefined> {
	const value = valueAfter(command, "--settings");
	if (value === undefined || value.startsWith("{")) {
		return value;
	}

	return await readFile(value, "utf8");
}

function namedSession(command: readonly string[]): string {
	const named = command.indexOf("--session-id");

	return (
		command[
			(named === MISSING_OPTION_INDEX ? command.indexOf("--resume") : named) +
				OPTION_VALUE_POSITION_OFFSET
		] ?? ""
	);
}

class FakeClaude {
	private readonly calls: FakeRun[] = [];

	public constructor(
		private readonly projects: string,
		private readonly reply: string,
		private readonly shellCommands: readonly (readonly string[])[] = [],
	) {}

	public get runs(): readonly FakeRun[] {
		return this.calls;
	}

	public readonly run: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		this.calls.push({
			command: [...command],
			cwd,
			seenFiles: await readdir(cwd, { recursive: true }),
			settingsText: await settingsText(command),
			shellOutputs: await this.shell(cwd),
		});
		const sessionId = namedSession(command);
		const slug = join(this.projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${transcriptLine(sessionId, this.reply)}\n`,
		);

		return envelope(this.reply);
	};

	private async shell(cwd: string): Promise<readonly string[]> {
		const outputs: string[] = [];
		await Array.fromAsync(this.shellCommands, async (each) => {
			outputs.push(await runCommand(each, cwd));
		});

		return outputs;
	}
}

function appendingClaude(
	projects: string,
	reply: string,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const resumed =
			command[command.indexOf("--resume") + OPTION_VALUE_POSITION_OFFSET] ?? "";

		const slug = join(projects, projectSlug(await realpath(cwd)));
		const file = join(slug, `${resumed}.jsonl`);
		await writeFile(
			file,
			`${await Bun.file(file).text()}${transcriptLine(resumed, reply)}\n`,
		);

		return envelope(reply);
	};
}

function claudeWriting(
	projects: string,
	extraLines: (sessionId: string, cwd: string) => readonly string[],
	reply: string,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const sessionId = namedSession(command);
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(
			join(slug, `${sessionId}.jsonl`),
			`${[...extraLines(sessionId, cwd), transcriptLine(sessionId, reply)].join("\n")}\n`,
		);

		return envelope(reply);
	};
}

function replylessClaude(
	run: SessionAttemptRequest["runClaude"],
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		await run(command, cwd);

		return JSON.stringify({
			is_error: false,
			num_turns: 30,
			session_id: namedSession(command),
			subtype: "error_max_turns",
			total_cost_usd: 0.0012,
			type: "result",
		});
	};
}

const PLANTED_BEFORE = "0000-unrelated-live.jsonl";

const PLANTED_AFTER = "zzzz-unrelated-live.jsonl";

function plantingClaude(
	projects: string,
	run: SessionAttemptRequest["runClaude"],
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await mkdir(slug, { recursive: true });
		await writeFile(join(slug, PLANTED_BEFORE), "{}\n");
		await writeFile(join(slug, PLANTED_AFTER), "{}\n");

		return await run(command, cwd);
	};
}

function budgetErrorEnvelope(sessionId: string): string {
	return JSON.stringify({
		duration_api_ms: 800,
		duration_ms: 900,
		is_error: true,
		num_turns: 2,
		result: "session exhausted its budget",
		session_id: sessionId,
		total_cost_usd: 0.0012,
		usage: {
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 12,
			output_tokens: 3,
		},
	});
}

export {
	budgetErrorEnvelope,
	OPTION_VALUE_POSITION_OFFSET,
	FIRST_RECORDED_PROVIDER_RUN_INDEX,
	SECOND_SHELL_OUTPUT_INDEX,
	valueAfter,
	namedSession,
	FakeClaude,
	appendingClaude,
	claudeWriting,
	replylessClaude,
	PLANTED_BEFORE,
	PLANTED_AFTER,
	plantingClaude,
};
