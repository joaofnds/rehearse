import { describe, expect, it } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { fakeClaude } from "./session-provider-test-fixture";
import SessionRunRequestBuilder from "./session-run-request-test-builder";

const SENTINEL = "sentinel-7c31d0-never-recorded";

const files = SessionAttemptTestFiles.forEachTest();

async function userHomeHoldingTheSentinel(): Promise<string> {
	const home = await files.temporary("rehearse-sentinel-home-");
	await mkdir(join(home, ".claude"));
	await writeFile(
		join(home, ".claude", "settings.json"),
		JSON.stringify({
			env: { API_TOKEN: SENTINEL },
			hooks: { SessionStart: [{ hooks: [{ command: SENTINEL }] }] },
			outputStyle: SENTINEL,
		}),
	);
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ mcpServers: { tracker: { command: SENTINEL } } }),
	);

	return home;
}

/** What the init event of a session run under that home reports, values beside the names. */
const SENTINEL_INIT = JSON.stringify({
	cwd: `/home/${SENTINEL}`,
	mcp_servers: [{ command: SENTINEL, name: "tracker", status: "connected" }],
	output_style: SENTINEL,
	plugins: [{ name: "alpha", path: `/home/${SENTINEL}/alpha` }],
	subtype: "init",
	type: "system",
});

/**
 * The transcript is Claude Code's own, copied as it was written, and a real
 * one carries the hook commands the user's settings hold, so this scan leaves
 * it out by name.
 */
const COPIED_TRANSCRIPT = "transcript.jsonl";

async function everyAuthoredText(directory: string): Promise<string> {
	const entries = await readdir(directory, {
		recursive: true,
		withFileTypes: true,
	});
	const texts = await Promise.all(
		entries
			.filter((entry) => entry.isFile() && entry.name !== COPIED_TRANSCRIPT)
			.map(
				async (entry) =>
					await Bun.file(join(entry.parentPath, entry.name)).text(),
			),
	);

	return texts.join("\n");
}

async function writesNoValueOfTheUserSetupIntoARecordFieldRehearseAuthors(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt(
		new SessionRunRequestBuilder({
			home: await userHomeHoldingTheSentinel(),
			projectsDirectory: projects,
			runClaude: fakeClaude(projects, "OK", SENTINEL_INIT),
			runsDirectory: runs,
		}).build(),
	);

	expect(outcome.record.setup).toMatchObject({
		hookEvents: ["SessionStart"],
		kind: "actual",
		loaded: { mcpServers: [{ name: "tracker" }], plugins: ["alpha"] },
	});
	expect(await everyAuthoredText(runs)).not.toContain(SENTINEL);
}

describe(runSessionDebugAttempt.name, () => {
	it(
		"writes no value of the user's setup into a record file Rehearse authors",
		writesNoValueOfTheUserSetupIntoARecordFieldRehearseAuthors,
	);
});
