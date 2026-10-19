import { afterEach } from "bun:test";
import { chmod, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";

import {
	FakeClaude,
	namedSession,
} from "./session-attempt-provider-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";

const RESOURCE_DRAIN_START_INDEX = 0;

const UNREADABLE_FILE_MODE = 0o000;

const EXECUTABLE_FILE_MODE = 0o755;

const SUB_AGENT_FILES = {
	"agent-a1.jsonl": `${transcriptLine("a1-session", "child reply")}\n`,
	"agent-a1.meta.json": `${JSON.stringify({ agentType: "reviewer", spawnDepth: 1, toolUseId: "toolu_1" })}\n`,
};

function claudeWithSubagents(
	projects: string,
	arrange: (subagents: string) => Promise<void>,
	session: SessionAttemptRequest["runClaude"] = new FakeClaude(projects, "OK")
		.run,
): SessionAttemptRequest["runClaude"] {
	return async (command, cwd) => {
		const output = await session(command, cwd);
		const subagents = join(
			projects,
			projectSlug(await realpath(cwd)),
			namedSession(command),
			"subagents",
		);
		await mkdir(subagents, { recursive: true });
		await arrange(subagents);

		return output;
	};
}

async function writeSubagentFiles(subagents: string): Promise<void> {
	await Array.fromAsync(
		Object.entries(SUB_AGENT_FILES),
		async ([name, text]) => {
			await writeFile(join(subagents, name), text);
		},
	);
}

async function retainedSubagentFiles(
	records: string,
): Promise<Record<string, string>> {
	const directory = join(records, "subagents");
	const retained: Record<string, string> = {};
	await Array.fromAsync(await readdir(directory), async (name) => {
		retained[name] = await Bun.file(join(directory, name)).text();
	});

	return retained;
}

const locked: string[] = [];

function registerSubagentFixtureCleanup(): void {
	afterEach(async () => {
		await Promise.all(
			locked.splice(RESOURCE_DRAIN_START_INDEX).map(async (path) => {
				await chmod(path, EXECUTABLE_FILE_MODE);
			}),
		);
	});
}

export {
	UNREADABLE_FILE_MODE,
	EXECUTABLE_FILE_MODE,
	SUB_AGENT_FILES,
	claudeWithSubagents,
	writeSubagentFiles,
	retainedSubagentFiles,
	locked,
	registerSubagentFixtureCleanup,
};
