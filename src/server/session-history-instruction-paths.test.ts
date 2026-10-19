import { afterEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { writtenResumedAttempt } from "#server/session-history-attempt-test-fixture";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe("/api/attempts/session/:caseId/:uuid/history/requests", () => {
	describe("when instruction attachments name host paths", () => {
		it(
			"redacts the absolute host paths the instructions attachment records",
			verifyRedactsTheAbsoluteHostPathsTheInstructionsAttachmentRecords,
		);

		it(
			"leaves no directory name when the load sat under a path containing a space",
			verifyLeavesNoDirectoryNameWhenTheLoadSatUnder,
		);

		it(
			"keeps two loads from one directory distinguishable",
			verifyKeepsTwoLoadsFromOneDirectoryDistinguishable,
		);
	});
});

async function verifyRedactsTheAbsoluteHostPathsTheInstructionsAttachmentRecords(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const transcript = await Bun.file(
		join(paths.directory, "transcript.jsonl"),
	).text();
	const attachment = {
		attachment: {
			files: [
				{
					content: "# secret",
					path: join(homedir(), ".claude", "CLAUDE.md"),
					type: "User",
				},
			],
			type: "instructions",
		},
		type: "attachment",
	};
	await Bun.write(
		paths.transcriptFile,
		`${transcript}\n${JSON.stringify(attachment)}`,
	);
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	const body = await response.text();
	expect(body).not.toContain(homedir());
	expect(JSON.parse(body)).toMatchObject({
		instructionLoads: {
			loads: [{ filePath: "<path>/CLAUDE.md", memoryType: "User" }],
			state: "available",
		},
	});
}

async function verifyLeavesNoDirectoryNameWhenTheLoadSatUnder(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const transcript = await Bun.file(
		join(paths.directory, "transcript.jsonl"),
	).text();
	const attachment = {
		attachment: {
			files: [
				{
					content: "# secret",
					path: join(
						homedir(),
						"Library",
						"Application Support",
						"Claude",
						"CLAUDE.md",
					),
					type: "User",
				},
			],
			type: "instructions",
		},
		type: "attachment",
	};
	await Bun.write(
		paths.transcriptFile,
		`${transcript}\n${JSON.stringify(attachment)}`,
	);
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	const body = await response.text();
	expect(body).not.toMatch(/Application Support|Library/u);
	expect(JSON.parse(body)).toMatchObject({
		instructionLoads: {
			loads: [{ filePath: "<path>/CLAUDE.md" }],
			state: "available",
		},
	});
}

async function verifyKeepsTwoLoadsFromOneDirectoryDistinguishable(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const transcript = await Bun.file(
		join(paths.directory, "transcript.jsonl"),
	).text();
	const attachment = {
		attachment: {
			files: [
				{
					content: "a",
					path: join(homedir(), ".claude", "CLAUDE.md"),
					type: "User",
				},
				{
					content: "b",
					path: join(homedir(), ".claude", "AGENTS.md"),
					type: "User",
				},
			],
			type: "instructions",
		},
		type: "attachment",
	};
	await Bun.write(
		paths.transcriptFile,
		`${transcript}\n${JSON.stringify(attachment)}`,
	);
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	expect(await response.json()).toMatchObject({
		instructionLoads: {
			loads: [
				{ filePath: "<path>/CLAUDE.md", memoryType: "User" },
				{ filePath: "<path>/AGENTS.md", memoryType: "User" },
			],
			state: "available",
		},
	});
}
