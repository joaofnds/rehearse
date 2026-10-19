import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { z } from "zod";

import { compareAttempts } from "./compare-attempts";
import type { Checkpoint } from "./compare-attempts-group-recording-fixture";
import { REPLAYED, RecordedArms } from "./compare-attempts-test-support";
import { RefusedPreconditionError } from "./exit-codes";

const RESOURCE_DRAIN_START_INDEX = 0;

const CONTROL_ARM_REQUEST_POSITION = 2;

const PERMISSION_MODE_RADIX = 0o1000;

const OWNER_FILE_MODE = 0o600;

const SHA256_HEX_DIGITS = 64;

const temporaryDirectories: string[] = [];

const SHARED = {
	"CLAUDE.md": "global instructions\n",
	"skills/review/SKILL.md": "review\n",
};

const armsSchema = z.object({
	baseline: z.string(),
	candidate: z.string(),
	control: z.string(),
});

const casesSchema = z.array(
	z.object({
		arms: armsSchema,
	}),
);

const SAVED_COMPARISON_MANIFEST_SCHEMA = z.object({ cases: casesSchema });

async function temporaryDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(directory);

	return directory;
}

async function recordedArms(): Promise<RecordedArms> {
	return await RecordedArms.create(
		await temporaryDirectory("rehearse-compare-runs-"),
		await temporaryDirectory("rehearse-compare-scratch-"),
	);
}

async function refusalOf(attempt: Promise<unknown>): Promise<Error> {
	try {
		await attempt;
	} catch (error) {
		if (error instanceof RefusedPreconditionError) {
			return error;
		}
		throw error;
	}
	throw new Error("Expected the comparison to be refused");
}

async function approveAny(): Promise<void> {
	// Every stated cost is approved.
}

/** Arms A and B at one checkpoint, differing in the stage's own skill. */
async function armsDifferingInOneSkill(
	checkpoint: Checkpoint = REPLAYED,
): Promise<{
	readonly arms: RecordedArms;
	readonly armA: string;
	readonly armB: string;
}> {
	const arms = await recordedArms();
	const armA = await arms.recordArm(
		"baseline",
		{
			...SHARED,
			"skills/build/SKILL.md": "build\n",
		},
		checkpoint,
	);
	const armB = await arms.recordArm(
		"candidate",
		{
			...SHARED,
			"skills/build/SKILL.md": "revised build\n",
		},
		checkpoint,
	);
	await arms.readInStage(armA, "skills/build/SKILL.md");
	await arms.readInStage(armB, "skills/build/SKILL.md");

	return { armA, armB, arms };
}

/** A comparison `compare attempts` saved, named by its manifest digest. */
async function savedComparison(): Promise<{
	readonly arms: RecordedArms;
	readonly comparison: string;
}> {
	const { arms, armA, armB } = await armsDifferingInOneSkill();
	const { reportFile } = await compareAttempts(
		{ armA, armB, runsDirectory: arms.runsDirectory },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { arms, comparison: basename(dirname(reportFile)) };
}

export {
	CONTROL_ARM_REQUEST_POSITION,
	OWNER_FILE_MODE,
	PERMISSION_MODE_RADIX,
	RESOURCE_DRAIN_START_INDEX,
	SAVED_COMPARISON_MANIFEST_SCHEMA,
	SHA256_HEX_DIGITS,
	SHARED,
	approveAny,
	armsDifferingInOneSkill,
	recordedArms,
	refusalOf,
	savedComparison,
	temporaryDirectories,
};
