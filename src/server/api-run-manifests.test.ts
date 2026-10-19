import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import ReadManifestEntryBuilder from "#benchmark/read-manifest-entry-test-builder";
import { directorySource } from "#benchmark/run-records-test-support";
import { sha256Hex } from "#server/api-test-responses";
import { ApiTestWorkspace, apiTestApp } from "#server/api-test-workspace";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/runs/:run", () => {
	it(
		"says of each stage's read-manifest corpus entry whether that file changed since",
		verifySaysOfEachStageSReadManifestCorpusEntry,
	);

	it(
		"says of a stopped stage's read-manifest corpus entry whether that file changed since",
		verifySaysOfAStoppedStageSReadManifestCorpus,
	);

	it(
		"serves the run with its read manifests unjudged when the corpus under test cannot judge them",
		verifyServesTheRunWithItsReadManifestsUnjudgedWhen,
	);

	it(
		"serves a stopped stage's read manifest unjudged when the corpus under test cannot judge it",
		verifyServesAStoppedStageSReadManifestUnjudgedWhen,
	);
});

async function verifySaysOfEachStageSReadManifestCorpusEntry(): Promise<void> {
	const { fixture, corpus, app } = await workspace.serving();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	await fixture.corpus.recordReadManifest("discuss", [
		new ReadManifestEntryBuilder({
			path: "skills/discuss/SKILL.md",
			sha256: sha256Hex("discuss skill\n"),
		}).build(),
	]);
	await fixture.corpus.recordReadManifest("build", [
		new ReadManifestEntryBuilder().build(),
	]);
	await Bun.write(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);

	const response = await app.run(fixture.replayableRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				readManifest: {
					entries: [
						{
							...new ReadManifestEntryBuilder({
								path: "skills/discuss/SKILL.md",
								sha256: sha256Hex("discuss skill\n"),
							}).build(),
							state: "unchanged",
						},
					],
					state: "available",
				},
				stage: "discuss",
			},
			{
				readManifest: {
					entries: [
						{ ...new ReadManifestEntryBuilder().build(), state: "changed" },
					],
					state: "available",
				},
				stage: "build",
			},
		],
	});
}

async function verifySaysOfAStoppedStageSReadManifestCorpus(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const corpus = await workspace.corpusDirectory();
	const instructions = new ReadManifestEntryBuilder({
		path: "CLAUDE.md",
		role: "global instructions",
		sha256: sha256Hex("the instructions\n"),
	}).build();
	const skill = new ReadManifestEntryBuilder().build();
	await fixture.corpus.recordStageReadManifest(
		"build",
		[instructions, skill],
		[instructions, skill].map(({ path, sha256 }) => ({ path, sha256 })),
	);
	await Bun.write(
		join(corpus, "skills", "build", "SKILL.md"),
		"build skill, edited\n",
	);
	const app = apiTestApp(fixture.runsDirectory, directorySource(corpus));

	const response = await app.run(fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				readManifest: {
					entries: [
						{ ...instructions, state: "unchanged" },
						{ ...skill, state: "changed" },
					],
					state: "available",
				},
				stage: "build",
			},
		],
	});
}

async function verifyServesTheRunWithItsReadManifestsUnjudgedWhen(): Promise<void> {
	const { fixture, corpus, app } = await workspace.serving();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	const entry = new ReadManifestEntryBuilder().build();
	await fixture.corpus.recordReadManifest("build", [entry]);
	await rm(join(corpus, "skills", "build"), { recursive: true });

	const response = await app.run(fixture.replayableRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual(
		expect.objectContaining({
			stages: [
				expect.objectContaining({ stage: "discuss" }),
				expect.objectContaining({
					readManifest: { entries: [entry], state: "available" },
					stage: "build",
				}),
			],
		}),
	);
}

async function verifyServesAStoppedStageSReadManifestUnjudgedWhen(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const corpus = await workspace.corpusDirectory();
	const skill = new ReadManifestEntryBuilder().build();
	await fixture.corpus.recordStageReadManifest(
		"build",
		[skill],
		[{ path: skill.path, sha256: skill.sha256 }],
	);
	await rm(join(corpus, "skills", "build"), { recursive: true });
	const app = apiTestApp(fixture.runsDirectory, directorySource(corpus));

	const response = await app.run(fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual(
		expect.objectContaining({
			stages: [
				expect.objectContaining({ stage: "discuss" }),
				expect.objectContaining({
					readManifest: { entries: [skill], state: "available" },
					stage: "build",
				}),
			],
		}),
	);
}
