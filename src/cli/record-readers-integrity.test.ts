import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { LIST_KINDS, runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";

import {
	stageCorpus,
	writtenReadOnlyFixture,
} from "./confirmation-read-test-fixture";
import { corpusAt } from "./show-record-test-driver";

const workspace = CliTestWorkspace.forEachTest();

const COMES_AFTER = 1;
const COMES_BEFORE = -1;

async function digestOfTree(root: string): Promise<readonly string[]> {
	const entries = await readdir(root, {
		recursive: true,
		withFileTypes: true,
	});
	const digests: string[] = [];

	await Array.fromAsync(
		entries.toSorted((left, right) =>
			left.name < right.name ? COMES_BEFORE : COMES_AFTER,
		),
		async (entry) => {
			const path = join(entry.parentPath, entry.name);
			digests.push(
				entry.isFile()
					? `${path}:${new Bun.CryptoHasher("sha256")
							.update(await Bun.file(path).bytes())
							.digest("hex")}`
					: `${path}:directory`,
			);
		},
	);

	return digests.toSorted();
}

async function leavesEveryFileUnderTheRunsDirectoryByteIdentical(): Promise<void> {
	const corpus = await stageCorpus(workspace);
	const { fixture, repId } = await writtenReadOnlyFixture(workspace, corpus);
	const root = fixture.runsDirectory;
	const judgedAgainstCorpus = corpusAt(corpus);

	const before = await digestOfTree(root);
	const recorder = recordOutput();

	await Array.fromAsync(LIST_KINDS, async (kind) => {
		await runList({ kind, runsDirectory: root }, recorder.output);
	});
	await Array.fromAsync(
		[
			`run:${fixture.replayableRun}`,
			`checkpoint:${fixture.replayableRun}/build`,
			`group:${fixture.groupId}`,
			`rep:stage:${fixture.groupId}/${repId}/build`,
			`comparison:${fixture.comparisonDigest}`,
			`attempt:session:${fixture.sessionAttempt.caseId}/${fixture.sessionAttempt.uuid}`,
			`attempt:stage:${fixture.stageAttempt.lineage}/${fixture.stageAttempt.timestamp}`,
		],
		async (id) => {
			await runShow(
				{ id, json: true, runsDirectory: root },
				recorder.output,
				judgedAgainstCorpus,
			);
			await runShow(
				{ id, json: false, runsDirectory: root },
				recorder.output,
				judgedAgainstCorpus,
			);
		},
	);

	expect(await digestOfTree(root)).toEqual(before);
}

describe("list and show are read-only", () => {
	it(
		"leaves every file under the runs directory byte-identical",
		leavesEveryFileUnderTheRunsDirectoryByteIdentical,
	);
});
