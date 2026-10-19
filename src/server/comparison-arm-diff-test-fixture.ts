import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import type { CorpusFiles } from "#benchmark/compare-attempts-group-recording-fixture";
import { RecordedArms } from "#benchmark/compare-attempts-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

const SHARED = { "CLAUDE.md": "global instructions\n" };

interface ComparedArmsRequest {
	readonly armA: CorpusFiles;
	readonly armB: CorpusFiles;
	readonly readOnlyByArmB?: readonly string[];
	readonly runsDirectory: string;
}

async function comparedArms({
	armA,
	armB,
	readOnlyByArmB = [],
	runsDirectory,
}: ComparedArmsRequest): Promise<{
	readonly runsDirectory: string;
	readonly digest: string;
}> {
	const arms = await RecordedArms.create(
		runsDirectory,
		await temporaryDirectory("rehearse-arm-diff-scratch-"),
	);
	const groupA = await arms.recordArm("baseline", { ...SHARED, ...armA });
	const groupB = await arms.recordArm("candidate", { ...SHARED, ...armB });
	await arms.readInStage(groupA, "skills/build/SKILL.md");
	await arms.readInStage(groupB, "skills/build/SKILL.md");
	await Array.fromAsync(readOnlyByArmB, async (path) => {
		await arms.readInStage(groupB, path);
	});
	const { reportFile } = await compareAttempts(
		{ armA: groupA, armB: groupB, runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { digest: basename(dirname(reportFile)), runsDirectory };
}

async function clearArmDiffRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export { temporaryDirectory, comparedArms, clearArmDiffRoots };
