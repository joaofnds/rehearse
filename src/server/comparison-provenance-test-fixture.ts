import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import { RecordedArms } from "#benchmark/compare-attempts-test-support";
import { confirmationGroupRecordSchema } from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	EXECUTABLE_PERMISSIONS,
	INACCESSIBLE_PERMISSIONS,
} from "#server/file-permissions-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

const lockedPaths: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

const SHARED = {
	"CLAUDE.md": "global instructions\n",
	"skills/review/SKILL.md": "review\n",
};

/**
 * Arms A and B replayed at one checkpoint on two corpus versions, compared by
 * `compare attempts`, whose baseline runner records no version.
 */
async function comparedArms(runsDirectory: string): Promise<{
	readonly runsDirectory: string;
	readonly digest: string;
}> {
	const arms = await RecordedArms.create(
		runsDirectory,
		await temporaryDirectory("rehearse-provenance-scratch-"),
	);
	const armA = await arms.recordArm("baseline", {
		...SHARED,
		"skills/build/SKILL.md": "build\n",
	});
	const armB = await arms.recordArm("candidate", {
		...SHARED,
		"skills/build/SKILL.md": "revised build\n",
	});
	await arms.readInStage(armA, "skills/build/SKILL.md");
	await arms.readInStage(armB, "skills/build/SKILL.md");
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { digest: basename(dirname(reportFile)), runsDirectory };
}

/** Takes every permission from a recorded path until the test ends. */
async function lock(path: string): Promise<void> {
	lockedPaths.push(path);
	await chmod(path, INACCESSIBLE_PERMISSIONS);
}

async function clearProvenanceRoots(): Promise<void> {
	await Promise.all(
		lockedPaths.splice(RESOURCE_DRAIN_START_INDEX).map(async (path) => {
			await chmod(path, EXECUTABLE_PERMISSIONS);
		}),
	);
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function recordedVersionDigest(
	runsDirectory: string,
	groupId: string,
): Promise<string> {
	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
	if (group.inputs.corpusVersion?.kind !== "version") {
		throw new Error(`Expected group ${groupId} to record a corpus version`);
	}

	return group.inputs.corpusVersion.digest;
}

export {
	recordedVersionDigest,
	temporaryDirectory,
	comparedArms,
	lock,
	clearProvenanceRoots,
};
