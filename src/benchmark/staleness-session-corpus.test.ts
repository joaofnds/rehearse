import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import { SMOKE_ATTEMPT } from "./staleness-record-test-fixtures";
import { sessionAttemptStaleness } from "./staleness-report";
import SessionCorpusFixtures from "./staleness-session-test-fixtures";
import { sha256Of } from "./staleness-test-files";

const FIRST_STALENESS_RECORD_INDEX = 0;

const fixtures = new SessionCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function namesEachDeclaredCorpusFileTheAttemptReadThatChanged(): Promise<void> {
	const runsDirectory = await fixtures.runsWithSmokeAttempt(
		await fixtures.styleCorpus("the brief style\n"),
	);

	const report = await sessionAttemptStaleness(
		runsDirectory,
		directorySource(await fixtures.styleCorpus("the brief style, edited\n")),
	);

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: ["output-styles/brief.md changed"],
			changedFiles: [{ change: "changed", path: "output-styles/brief.md" }],
			distance: {
				kind: "not-recorded",
				reason: "recorded before corpus versions",
			},
			id: SMOKE_ATTEMPT,
			onlyCorpusFiles: true,
			stale: true,
		}),
	]);
}

async function stalesAnAttemptWhoseLoadedFileBeyondItsDeclaredFilesChanged(): Promise<void> {
	const corpus = await fixtures.styleCorpus("the brief style\n");
	await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
	await Bun.write(join(corpus, "skills", "delivery", "SKILL.md"), "edited\n");
	const root = await fixtures.temporaryDirectory("rehearse-case-stale-");
	const fixture = new RecordedRunsFixture(root);
	await fixture.sessions.writeAttemptReading({
		caseId: "smoke",
		corpusRoot: corpus,
		layoutPaths: ["output-styles/brief.md"],
	});
	await fixture.sessions.recordAttemptReadManifest([
		{
			evidence: "observed",
			half: "corpus",
			path: "skills/delivery/SKILL.md",
			role: "read for context",
			sha256: sha256Of("delivery\n"),
		},
	]);

	const report = await sessionAttemptStaleness(root, directorySource(corpus));

	expect(report.records).toEqual([
		expect.objectContaining({
			causes: ["skills/delivery/SKILL.md changed"],
			id: SMOKE_ATTEMPT,
			onlyCorpusFiles: true,
			readManifest: [
				expect.objectContaining({
					path: "skills/delivery/SKILL.md",
					state: "changed",
				}),
			],
			stale: true,
		}),
	]);
	expect(
		report.records[FIRST_STALENESS_RECORD_INDEX]?.readFiles.map(
			({ path }) => path,
		),
	).toContain("skills/delivery/SKILL.md");
}

async function saysWhyAnAttemptOfACaseNoLongerDeclaredCannotBeJudged(): Promise<void> {
	const corpus = await fixtures.styleCorpus("the brief style\n");
	const root = await fixtures.temporaryDirectory("rehearse-case-stale-");
	await new RecordedRunsFixture(root).sessions.writeAttemptReading({
		caseId: "retired-case",
		corpusRoot: corpus,
		layoutPaths: ["output-styles/brief.md"],
	});

	const report = await sessionAttemptStaleness(root, directorySource(corpus));

	expect(report.records).toEqual([]);
	expect(report.unreadable).toContainEqual({
		id: "attempt:session:retired-case/0f6b6f2a-0000-4000-8000-000000000001",
		reason: "corpus files unknown: case no longer declared",
	});
}

async function reportsTheAttemptCleanWhenTheCorpusStillHoldsTheRecordedBytes(): Promise<void> {
	const corpus = await fixtures.styleCorpus("the brief style\n");
	const runsDirectory = await fixtures.runsWithSmokeAttempt(corpus);

	const report = await sessionAttemptStaleness(
		runsDirectory,
		directorySource(corpus),
	);

	expect(report.records.map(({ id, stale }) => ({ id, stale }))).toEqual([
		{ id: SMOKE_ATTEMPT, stale: false },
	]);
}

async function namesAnOutOfExtentLiveFileAsAStaleCauseInsteadOfFreshness(): Promise<void> {
	const recordedCorpus = await fixtures.styleCorpus("the brief style\n");
	const runsDirectory = await fixtures.runsWithSmokeAttempt(recordedCorpus);
	const root = await mkdtemp(join(tmpdir(), "rehearse-live-install-"));
	const backingRoot = await mkdtemp(join(tmpdir(), "rehearse-live-backing-"));
	const outside = await fixtures.styleCorpus("FOREIGN STYLE\n");
	fixtures.own([root, backingRoot]);
	await mkdir(join(root, "output-styles"), { recursive: true });
	await symlink(
		join(outside, "output-styles", "brief.md"),
		join(root, "output-styles", "brief.md"),
	);

	const report = await sessionAttemptStaleness(runsDirectory, {
		backingRoot,
		kind: "live",
		root,
	});

	expect(
		report.records.map(
			({ id, stale, causes, changedFiles, onlyCorpusFiles }) => ({
				causes,
				changedFiles,
				id,
				onlyCorpusFiles,
				stale,
			}),
		),
	).toEqual([
		{
			causes: [
				"Corpus file output-styles/brief.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
			],
			changedFiles: [],
			id: SMOKE_ATTEMPT,
			onlyCorpusFiles: false,
			stale: true,
		},
	]);
}

describe(sessionAttemptStaleness.name, () => {
	it(
		"names each declared corpus file the attempt read that changed",
		namesEachDeclaredCorpusFileTheAttemptReadThatChanged,
	);
	it(
		"stales an attempt whose loaded file beyond its declared files changed",
		stalesAnAttemptWhoseLoadedFileBeyondItsDeclaredFilesChanged,
	);
	it(
		"says why an attempt of a case no longer declared cannot be judged",
		saysWhyAnAttemptOfACaseNoLongerDeclaredCannotBeJudged,
	);
	it(
		"reports the attempt clean when the corpus still holds the recorded bytes",
		reportsTheAttemptCleanWhenTheCorpusStillHoldsTheRecordedBytes,
	);
	it(
		"names an out-of-extent live file as a stale cause instead of freshness",
		namesAnOutOfExtentLiveFileAsAStaleCauseInsteadOfFreshness,
	);
});
