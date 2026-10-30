import { describe, expect, it } from "bun:test";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ClaudeRunner } from "#benchmark/session-attempt";
import { projectSlug } from "#benchmark/session-capture";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import { fakeClaudeEnvelope } from "./session-provider-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const OPTION_VALUE_OFFSET = 1;

const CITED_RULE = ".agents/rulebook/ownership.md";

interface CitingRun {
	readonly home: string;
	readonly corpus: string;
	readonly projects: string;
}

/**
 * A home whose live install links its rulebook into `~/.agents`, as the
 * user's does, and a corpus whose instructions cite that rulebook by home
 * path while holding the arm's own copy.
 */
async function citingRun(): Promise<CitingRun> {
	const home = await realpath(await files.temporary("rehearse-home-"));
	await Bun.write(join(home, CITED_RULE), "LIVE RULE\n");
	await mkdir(join(home, ".claude"), { recursive: true });
	await symlink(join(home, ".agents/rulebook"), join(home, ".claude/rulebook"));
	const corpus = await files.temporary("rehearse-corpus-");
	await Bun.write(join(corpus, "CLAUDE.md"), `Follow ~/${CITED_RULE}.\n`);
	await Bun.write(join(corpus, "rulebook/ownership.md"), "ARM RULE\n");

	return {
		corpus,
		home,
		projects: await files.temporary("rehearse-projects-"),
	};
}

/** An assistant transcript line holding one Read call. */
interface ReadLine {
	readonly message: {
		readonly content: readonly {
			readonly id: string;
			readonly input: { readonly file_path: string };
			readonly name: "Read";
			readonly type: "tool_use";
		}[];
	};
	readonly type: "assistant";
}

interface SessionWrites {
	readonly main: readonly ReadLine[];
	readonly subagent?: readonly ReadLine[] | undefined;
}

function readOf(filePath: string): ReadLine {
	return {
		message: {
			content: [
				{
					id: "read-1",
					input: { file_path: filePath },
					name: "Read",
					type: "tool_use",
				},
			],
		},
		type: "assistant",
	};
}

function jsonl(lines: readonly ReadLine[]): string {
	return lines.map((line) => `${JSON.stringify(line)}\n`).join("");
}

/** The path the delivered CLAUDE.md cites, as the session sees it. */
async function citedPath(cwd: string): Promise<string> {
	const instructions = await Bun.file(join(cwd, ".claude/CLAUDE.md")).text();

	return instructions.replace(/^Follow (?<cited>.*)\.\n$/u, "$<cited>");
}

async function writeTranscripts(
	slug: string,
	sessionId: string,
	{ main, subagent }: SessionWrites,
): Promise<void> {
	await mkdir(join(slug, sessionId, "subagents"), { recursive: true });
	await writeFile(join(slug, `${sessionId}.jsonl`), jsonl(main));
	if (subagent !== undefined) {
		await writeFile(
			join(slug, sessionId, "subagents", "agent-a1.jsonl"),
			jsonl(subagent),
		);
	}
}

/**
 * A session that follows the citation its instructions carry: it replies
 * with the bytes of the file the delivered CLAUDE.md names, read from the
 * directory it starts in, and writes the transcript lines it is given.
 */
function citationFollowingClaude(
	projects: string,
	writes: (cited: string) => SessionWrites,
): ClaudeRunner {
	return async (command, cwd) => {
		const sessionId =
			command[command.indexOf("--session-id") + OPTION_VALUE_OFFSET] ?? "";
		const cited = await citedPath(cwd);
		const reply = await Bun.file(join(cwd, cited)).text();
		const slug = join(projects, projectSlug(await realpath(cwd)));
		await writeTranscripts(slug, sessionId, writes(cited));

		return fakeClaudeEnvelope(sessionId, reply.trim());
	};
}

async function attemptUnder(
	run: CitingRun,
	writes: (cited: string) => SessionWrites,
): ReturnType<typeof runSessionDebugAttempt> {
	return await runSessionDebugAttempt({
		config: { ...config, corpus: run.corpus },
		environment: {},
		home: run.home,
		projectsDirectory: run.projects,
		runClaude: citationFollowingClaude(run.projects, writes),
		runsDirectory: await files.temporary("rehearse-runs-"),
		sessionCase: new SessionCaseBuilder({
			declaration: {
				checks: [],
				corpusFiles: [],
				id: "smoke",
				kind: "session",
				projectFiles: [],
				prompt: "Follow your rule.",
				title: "Smoke",
				tools: [],
			},
		}).build(),
		spendCeilingUsd: 100,
	});
}

async function readsTheArmSCopyOfAFileItsInstructionsCiteByHomePath(): Promise<void> {
	const run = await citingRun();

	const outcome = await attemptUnder(run, (cited) => ({
		main: [readOf(cited)],
	}));

	expect(outcome.record.reply).toBe("ARM RULE");
	expect(outcome.record.corpusDelivery).toEqual({
		liveReads: [],
		redirected: 1,
		rule: 1,
	});
}

async function recordsAReadOfTheLiveCopyByLayoutPathAndCount(): Promise<void> {
	const run = await citingRun();
	const live = join(run.home, CITED_RULE);

	const outcome = await attemptUnder(run, () => ({
		main: [readOf(live)],
		subagent: [readOf(live)],
	}));

	expect(outcome.record.corpusDelivery?.liveReads).toEqual([
		{ count: 2, path: "rulebook/ownership.md" },
	]);
	expect(JSON.stringify(outcome.record.corpusDelivery)).not.toContain(run.home);
}

describe("an attempt whose corpus cites its own files by home path", () => {
	it(
		"reads the arm's copy of a file its instructions cite by home path",
		readsTheArmSCopyOfAFileItsInstructionsCiteByHomePath,
	);

	it(
		"records a read of the live copy, by the session or a sub-agent, by layout path and count",
		recordsAReadOfTheLiveCopyByLayoutPathAndCount,
	);
});
