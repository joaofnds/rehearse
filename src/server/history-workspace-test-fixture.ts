import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import type { RecordedRunsOptions } from "#benchmark/run-records-test-support";
import type { ClaimSubject } from "#benchmark/short-id";
import { claimShortId } from "#benchmark/short-id";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function corpusDirectory(buildSkill: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-corpus-"));
	roots.push(root);
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
	await Bun.write(join(root, "skills", "build", "SKILL.md"), buildSkill);
	await Bun.write(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	return root;
}

async function writtenFixture(
	options: RecordedRunsOptions = {},
): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-history-"));
	roots.push(root);
	const fixture = new RecordedRunsFixture(root, options);
	await fixture.write();

	return fixture;
}

/**
 * A fixture whose records carry the live root settings digest. Every
 * assertion about a row's `stale` flag needs it, because `deriveStaleness`
 * compares the recorded digest against the one it loads from that file. The
 * fixture's own literal never matches, so it would decide the flag on its
 * own, passing a `stale: false` test for the wrong reason and passing a
 * `stale: true` test whatever the corpus holds.
 */
async function fixtureRecordingLiveSettings(): Promise<RecordedRunsFixture> {
	return await writtenFixture({ settingsFile: await liveStageSettings() });
}

const laterRun = "2026-09-11T00-00-00.000Z";

/**
 * The fixture's audit-log records claimed oldest first, then the claims
 * of any records written earlier, then a later run that claims before it
 * writes its record, as a started run does.
 */
async function fixtureWithClaimedRun(
	recordEarlier: (
		fixture: RecordedRunsFixture,
	) => Promise<readonly ClaimSubject[]> = async () => await Promise.resolve([]),
): Promise<RecordedRunsFixture> {
	const fixture = await writtenFixture();
	const earlierClaims = await recordEarlier(fixture);
	await fixture.claim("audit-log", [
		...fixture.auditLogClaims,
		...earlierClaims,
	]);
	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "run",
		run: laterRun,
	});
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: laterRun,
	});

	return fixture;
}
async function clearHistoryRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}
interface VersionedHistoryFixture {
	readonly fixture: RecordedRunsFixture;
	readonly corpus: string;
}

async function versionedHistoryFixture(): Promise<VersionedHistoryFixture> {
	const fixture = await fixtureRecordingLiveSettings();
	const corpus = await corpusDirectory("build skill\n");
	const source = directorySource(corpus);
	await fixture.corpus.recordCorpusFrom(source);
	await fixture.corpus.recordVersionFrom(source);
	await fixture.corpus.recordReplayFrom(source);
	await fixture.confirmations.corpus.recordGroupFrom(source);

	return { corpus, fixture };
}

interface HistoryGroupFixture {
	readonly fixture: RecordedRunsFixture;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly reps: Awaited<
		ReturnType<
			RecordedRunsFixture["confirmations"]["records"]["writeSessionGroup"]
		>
	>;
}

async function writtenHistoryGroup(
	groupId: string,
	count: number,
): Promise<HistoryGroupFixture> {
	const fixture = await writtenFixture();
	const reps = await fixture.confirmations.records.writeSessionGroup(
		groupId,
		count,
	);

	return {
		fixture,
		paths: confirmationGroupPaths(fixture.runsDirectory, groupId),
		reps,
	};
}

export {
	writtenHistoryGroup,
	versionedHistoryFixture,
	roots,
	corpusDirectory,
	writtenFixture,
	fixtureRecordingLiveSettings,
	laterRun,
	fixtureWithClaimedRun,
	clearHistoryRoots,
};
