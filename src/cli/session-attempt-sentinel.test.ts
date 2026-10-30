import { describe, expect, it } from "bun:test";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import { fakeClaude } from "./session-provider-test-fixture";

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

async function everyWrittenText(directory: string): Promise<string> {
	const entries = await readdir(directory, {
		recursive: true,
		withFileTypes: true,
	});
	const texts = await Promise.all(
		entries
			.filter((entry) => entry.isFile())
			.map(
				async (entry) =>
					await Bun.file(join(entry.parentPath, entry.name)).text(),
			),
	);

	return texts.join("\n");
}

async function writesNoValueOfTheUserSetupIntoAnyRecordFile(): Promise<void> {
	const runs = await files.temporary("rehearse-runs-");
	const projects = await files.temporary("rehearse-projects-");

	const outcome = await runSessionDebugAttempt({
		config,
		environment: {},
		home: await userHomeHoldingTheSentinel(),
		projectsDirectory: projects,
		runClaude: fakeClaude(projects, "OK", SENTINEL_INIT),
		runsDirectory: runs,
		sessionCase: new SessionCaseBuilder().build(),
		spendCeilingUsd: 100,
	});

	expect(outcome.record.setup).toMatchObject({
		hookEvents: ["SessionStart"],
		kind: "actual",
		loaded: { mcpServers: [{ name: "tracker" }], plugins: ["alpha"] },
	});
	expect(await everyWrittenText(runs)).not.toContain(SENTINEL);
}

describe("a value in the user's setup", () => {
	it(
		"is written into no record file an attempt leaves",
		writesNoValueOfTheUserSetupIntoAnyRecordFile,
	);
});
