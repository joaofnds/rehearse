import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { compareAttempts } from "#benchmark/compare-attempts";
import {
	CASE_ID,
	groupIdFor,
	RecordedArms,
	REPLAYED,
} from "#benchmark/compare-attempts-test-support";
import { confirmationGroupRecordSchema } from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	directorySource,
	fixedCorpusSource,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";

const readingSchema = z.discriminatedUnion("state", [
	z.object({ state: z.literal("available") }).loose(),
	z.object({
		state: z.literal("unavailable"),
		reasons: z.array(z.string()),
	}),
]);
const provenanceSchema = z.object({
	checkpoint: readingSchema,
	corpusVersions: z.record(z.string(), z.record(z.string(), readingSchema)),
});

const roots: string[] = [];
const lockedPaths: string[] = [];

afterEach(async () => {
	await Promise.all(lockedPaths.splice(0).map((path) => chmod(path, 0o755)));
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

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
async function comparedArms(): Promise<{
	readonly runsDirectory: string;
	readonly digest: string;
}> {
	const runsDirectory = await temporaryDirectory("rehearse-provenance-runs-");
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
		{ runsDirectory, armA, armB },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { runsDirectory, digest: basename(dirname(reportFile)) };
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

async function provenanceOf(
	runsDirectory: string,
	digest: string,
): Promise<z.infer<typeof provenanceSchema>> {
	const app = createApiApp({
		projectsDirectory: NO_PROVIDER_PROJECTS,
		runsDirectory,
		liveness: nothingRunning,
		readCorpusSource: fixedCorpusSource(
			directorySource(await temporaryDirectory("rehearse-provenance-corpus-")),
		),
	});

	const response = await app.request(`/api/comparisons/${digest}`);
	expect(response.status).toBe(200);

	return provenanceSchema.parse(await response.json());
}

/** Takes every permission from a recorded path until the test ends. */
async function lock(path: string): Promise<void> {
	lockedPaths.push(path);
	await chmod(path, 0o000);
}

describe("GET /api/comparisons/:digest", () => {
	it("serves the checkpoint every arm of a one-checkpoint stage comparison replayed", async () => {
		const { runsDirectory, digest } = await comparedArms();

		const { checkpoint } = await provenanceOf(runsDirectory, digest);

		expect(checkpoint).toEqual({ state: "available", ...REPLAYED });
	});

	it("serves the corpus version each arm's groups recorded", async () => {
		const { runsDirectory, digest } = await comparedArms();

		const { corpusVersions } = await provenanceOf(runsDirectory, digest);

		expect(corpusVersions[CASE_ID]).toEqual({
			baseline: {
				state: "available",
				digest: await recordedVersionDigest(
					runsDirectory,
					groupIdFor("baseline"),
				),
			},
			candidate: {
				state: "available",
				digest: await recordedVersionDigest(
					runsDirectory,
					groupIdFor("candidate"),
				),
			},
			control: { state: "unavailable", reasons: ["version not recorded"] },
		});
	});

	it("names no checkpoint for a pipeline comparison, which replays none", async () => {
		const fixture = new RecordedRunsFixture(
			await temporaryDirectory("rehearse-provenance-pipeline-"),
		);
		await fixture.write();

		const { checkpoint } = await provenanceOf(
			fixture.runsDirectory,
			fixture.comparisonDigest,
		);

		expect(checkpoint).toEqual({
			state: "unavailable",
			reasons: ["a pipeline comparison replays no single checkpoint"],
		});
	});

	describe("when an arm's records cannot be read", () => {
		it("names no checkpoint when a group record no longer parses", async () => {
			const { runsDirectory, digest } = await comparedArms();
			await Bun.write(
				confirmationGroupPaths(runsDirectory, groupIdFor("baseline")).groupFile,
				"{}\n",
			);

			const { checkpoint } = await provenanceOf(runsDirectory, digest);

			expect(checkpoint.state).toBe("unavailable");
		});

		it("serves the comparison with the checkpoint unavailable when the case's claims cannot be listed", async () => {
			const { runsDirectory, digest } = await comparedArms();
			await lock(join(runsDirectory, "short-ids", CASE_ID, "claims"));

			const { checkpoint } = await provenanceOf(runsDirectory, digest);

			expect(checkpoint).toEqual({
				state: "unavailable",
				reasons: [
					`the short ids of ${CASE_ID} could not be read: EACCES: permission denied, scandir '<path>'`,
				],
			});
		});

		it("serves the comparison with an arm's version unavailable when its group record cannot be opened", async () => {
			const { runsDirectory, digest } = await comparedArms();
			await lock(
				confirmationGroupPaths(runsDirectory, groupIdFor("candidate"))
					.groupFile,
			);

			const { corpusVersions } = await provenanceOf(runsDirectory, digest);

			expect(corpusVersions[CASE_ID]?.["candidate"]).toEqual({
				state: "unavailable",
				reasons: [
					"a group record could not be read: EACCES: permission denied, lstat '<path>'",
				],
			});
		});
	});
});
