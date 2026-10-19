import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { relative } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runShow } from "#cli/show-command";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import {
	inaccessibleRepStage,
	stageCorpus,
} from "./confirmation-read-test-fixture";
import { NO_CORPUS, corpusAt } from "./show-record-test-driver";

const workspace = CliTestWorkspace.forEachTest();

async function namesARepStageItCouldNotReadRelative(): Promise<void> {
	const { fixture, repId, stageFile, makeReadable } =
		await inaccessibleRepStage(workspace);

	const recorder = recordOutput();

	await runShow(
		{
			id: `group:${fixture.groupId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		corpusAt(await stageCorpus(workspace)),
	);

	const stdout = recorder.stdout.join("");

	await makeReadable();
	expect(stdout).toContain(
		`${repId} build could not be read: EACCES: permission denied, open '${relative(CONTROL_DIR, stageFile)}'`,
	);
	expect(stdout).not.toContain(homedir());
}

async function printsAConfirmationRepSStageFileWithThe(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [
			{
				evidence: "declared",
				half: "corpus",
				path: "skills/build/SKILL.md",
				role: "stage skill",
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			},
		],
		repId,
		stage: "build",
	});

	const recorder = recordOutput();

	await runShow(
		{
			id: `rep:stage:${fixture.groupId}/${repId}/build`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(
		await Bun.file(
			confirmationGroupPaths(fixture.runsDirectory, fixture.groupId)
				.rep(repId)
				.stageFile("build"),
		).text(),
	);
}

async function printsASessionConfirmationRepSAttemptWithThe(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordSessionGroupRepAttempt(
		{ groupId: fixture.groupId, repId },
		{
			corpusRoot: fixture.runsDirectory,
			layoutPaths: [],
			readManifest: [
				{
					evidence: "declared",
					half: "project",
					path: "CLAUDE.md",
					role: "project instructions",
				},
			],
		},
	);

	const recorder = recordOutput();

	await runShow(
		{
			id: `rep:session:${fixture.groupId}/${repId}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recorder.output,
		NO_CORPUS,
	);

	const stdout = recorder.stdout.join("");

	expect(stdout).toBe(
		await Bun.file(
			confirmationGroupPaths(fixture.runsDirectory, fixture.groupId).rep(repId)
				.attemptFile,
		).text(),
	);
}

describe(runShow.name, () => {
	it(
		"names a rep stage it could not read relative to the control root",
		namesARepStageItCouldNotReadRelative,
	);
	it(
		"prints a confirmation rep's stage file with the reads it recorded",
		printsAConfirmationRepSStageFileWithThe,
	);
	it(
		"prints a session confirmation rep's attempt with the reads it recorded",
		printsASessionConfirmationRepSAttemptWithThe,
	);
});
