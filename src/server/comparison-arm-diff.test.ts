import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { compareAttempts } from "#benchmark/compare-attempts";
import {
	CASE_ID,
	groupIdFor,
	RecordedArms,
} from "#benchmark/compare-attempts-test-support";
import type { CorpusFiles } from "#benchmark/compare-attempts-test-support";
import {
	directorySource,
	fixedCorpusSource,
	NO_PROVIDER_PROJECTS,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { createApiApp } from "./api";
import { MISMATCHED_FROZEN_COPY_REASON } from "./comparison-arm-diff";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

const SHARED = { "CLAUDE.md": "global instructions\n" };

async function comparedArms(
	armA: CorpusFiles,
	armB: CorpusFiles,
	readOnlyByArmB: readonly string[] = [],
): Promise<{ readonly runsDirectory: string; readonly digest: string }> {
	const runsDirectory = await temporaryDirectory("rehearse-arm-diff-runs-");
	const arms = await RecordedArms.create(
		runsDirectory,
		await temporaryDirectory("rehearse-arm-diff-scratch-"),
	);
	const groupA = await arms.recordArm("baseline", { ...SHARED, ...armA });
	const groupB = await arms.recordArm("candidate", { ...SHARED, ...armB });
	await arms.readInStage(groupA, "skills/build/SKILL.md");
	await arms.readInStage(groupB, "skills/build/SKILL.md");
	for (const path of readOnlyByArmB) {
		await arms.readInStage(groupB, path);
	}
	const { reportFile } = await compareAttempts(
		{ runsDirectory, armA: groupA, armB: groupB },
		{ runBaselineGroup: arms.runBaselineGroup },
	);

	return { runsDirectory, digest: basename(dirname(reportFile)) };
}

const fileTextSchema = z.discriminatedUnion("state", [
	z.object({ state: z.literal("available"), text: z.string() }),
	z.object({ state: z.literal("absent") }),
	z.object({ state: z.literal("unavailable"), reasons: z.array(z.string()) }),
]);
const armDiffSchema = z.record(
	z.string(),
	z.array(
		z.object({
			path: z.string(),
			baseline: fileTextSchema,
			candidate: fileTextSchema,
		}),
	),
);

async function differingFiles(
	response: Response,
): Promise<z.infer<typeof armDiffSchema>[string]> {
	const body = armDiffSchema.parse(await response.json());

	return body[CASE_ID] ?? [];
}

async function armDiffOf(
	runsDirectory: string,
	digest: string,
): Promise<Response> {
	const app = createApiApp({
		projectsDirectory: NO_PROVIDER_PROJECTS,
		runsDirectory,
		liveness: nothingRunning,
		readCorpusSource: fixedCorpusSource(
			directorySource(await temporaryDirectory("rehearse-arm-diff-corpus-")),
		),
	});

	return app.request(`/api/comparisons/${digest}/arm-diff`);
}

async function frozenCopy(
	runsDirectory: string,
	role: "baseline" | "candidate",
	layoutPath: string,
): Promise<string> {
	const glob = new Bun.Glob(
		`confirmations/${groupIdFor(role)}/inputs/corpus/**/${layoutPath}`,
	);
	const [found] = await Array.fromAsync(glob.scan({ cwd: runsDirectory }));
	if (found === undefined) {
		throw new Error(`No frozen copy of ${layoutPath} for arm ${role}`);
	}

	return join(runsDirectory, found);
}

const SKILL = "skills/build/SKILL.md";

describe("GET /api/comparisons/:digest/arm-diff", () => {
	it("serves each file that differs between arms A and B at the text each arm froze", async () => {
		const { runsDirectory, digest } = await comparedArms(
			{ [SKILL]: "build\n" },
			{ [SKILL]: "revised build\n" },
		);

		const response = await armDiffOf(runsDirectory, digest);

		expect(response.status).toBe(200);
		expect(await differingFiles(response)).toContainEqual({
			path: SKILL,
			baseline: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "baseline", SKILL),
				).text(),
			},
			candidate: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "candidate", SKILL),
				).text(),
			},
		});
	});

	it("reads a file only one arm ran as absent from the other", async () => {
		const notes = "skills/build/notes.md";
		const { runsDirectory, digest } = await comparedArms(
			{ [SKILL]: "build\n" },
			{ [SKILL]: "revised build\n" },
			[notes],
		);

		const response = await armDiffOf(runsDirectory, digest);

		expect(await differingFiles(response)).toContainEqual({
			path: notes,
			baseline: { state: "absent" },
			candidate: {
				state: "available",
				text: await Bun.file(
					await frozenCopy(runsDirectory, "candidate", notes),
				).text(),
			},
		});
	});

	it("says an arm's text is unavailable when its frozen copy no longer matches the recorded digest", async () => {
		const { runsDirectory, digest } = await comparedArms(
			{ [SKILL]: "build\n" },
			{ [SKILL]: "revised build\n" },
		);
		await Bun.write(
			await frozenCopy(runsDirectory, "candidate", SKILL),
			"edited after the run\n",
		);

		const response = await armDiffOf(runsDirectory, digest);

		const files = await differingFiles(response);
		const skill = files.find(({ path }) => path === SKILL);
		expect(skill?.candidate).toEqual({
			state: "unavailable",
			reasons: [MISMATCHED_FROZEN_COPY_REASON],
		});
	});
});
