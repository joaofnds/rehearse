import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionCaseArgs } from "#benchmark/session-attempt-invocation";
import { prepareActualSetup } from "#benchmark/session-setup";

import {
	sessionCase,
	sessionCaseOptions,
} from "./session-attempt-case-test-fixtures";

const SENTINEL = "sentinel-2b8e41-never-written";

let home = "";
let setupDirectory = "";

async function setUp(): Promise<void> {
	home = await mkdtemp(join(tmpdir(), "rehearse-sentinel-home-"));
	setupDirectory = await mkdtemp(join(tmpdir(), "rehearse-sentinel-files-"));
	await mkdir(join(home, ".claude"));
}

async function tearDown(): Promise<void> {
	await rm(home, { force: true, recursive: true });
	await rm(setupDirectory, { force: true, recursive: true });
}

async function setupFailureMessage(): Promise<string> {
	try {
		await prepareActualSetup({
			declared: {},
			directory: setupDirectory,
			home,
		});
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	return "";
}

async function namesAMalformedFileWithoutQuotingIt(): Promise<void> {
	await writeFile(
		join(home, ".claude", "settings.json"),
		`{"env": {"API_TOKEN": "${SENTINEL}"`,
	);

	const failure = await setupFailureMessage();

	expect(failure).toContain("settings.json is not valid JSON");
	expect(failure).not.toContain(SENTINEL);
}

async function carriesTheSetupByPathSoNoValueReachesTheCommand(): Promise<void> {
	await writeFile(
		join(home, ".claude", "settings.json"),
		JSON.stringify({ env: { API_TOKEN: SENTINEL } }),
	);
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ mcpServers: { tracker: { command: SENTINEL } } }),
	);
	const { files } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		home,
	});

	const command = sessionCaseArgs(sessionCase(), {
		...sessionCaseOptions(),
		setup: files,
	});

	expect(command.join(" ")).not.toContain(SENTINEL);
}

describe("a value in the user's setup", () => {
	beforeEach(setUp);
	afterEach(tearDown);

	it(
		"stays out of the error that names a malformed file",
		namesAMalformedFileWithoutQuotingIt,
	);
	it(
		"stays out of the command, which carries the setup by path",
		carriesTheSetupByPathSoNoValueReachesTheCommand,
	);
});
