import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths, replayRecordFile } from "#benchmark/run-layout";
import {
	GIT_SHA1_HEX_DIGITS,
	SHA256_HEX_DIGITS,
} from "#server/digest-test-support";
import { writeHistoryManifest } from "#server/session-history-stage-test-fixture";
import { historyRunsDirectory } from "#server/session-history-workspace-test-fixture";

/**
 * A replay's scorecard carries its session id and parsed exchanges. The report
 * must not render either as raw evidence, so the tests name them here and then
 * assert the serialized report holds neither.
 */
const REPLAY_SESSION_ID = "1ad63c8d-75ec-4b27-8ff1-751826f6849e";

const REPLAY_EXCHANGE_TEXT = "the replayed stage answered";

const REPLAY_IDENTITY = {
	lineage: "lineage-discuss",
	recordedTimestamp: "2026-09-06T22:33:15.057Z",
	runName: "2026-09-06T21-58-29.508Z",
	timestamp: "2026-09-06T22-33-15.057Z",
};

const REPLAY_RECORD = {
	baseSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
	consumed: {
		lineage: REPLAY_IDENTITY.lineage,
		stage: "discuss",
		targetSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
	},
	controlSha: "1".repeat(GIT_SHA1_HEX_DIGITS),
	corpusFiles: [
		{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
		{
			path: "skills/build/SKILL.md",
			sha256: "b".repeat(SHA256_HEX_DIGITS),
		},
	],
	judgeCostUsd: 0.5,
	judgeModel: "opus",
	lineage: "lineage-build",
	model: "sonnet",
	productOwnerCostUsd: 0.25,
	replay: true,
	runName: REPLAY_IDENTITY.runName,
	scorecard: {
		costUsd: 1,
		grade: { dimensions: [], grade: "A", verdict: "CONTINUE" },
		input: {
			stage: "build",
			transcript: {
				costUsd: 1,
				exchanges: [
					{ agent: REPLAY_EXCHANGE_TEXT },
					{ agent: "answered again" },
				],
				providerCalls: [],
				sessionId: REPLAY_SESSION_ID,
				stage: "build",
			},
		},
		stage: "build",
	},
	sessionBudgetUsd: 5,
	stage: "build",
	stageCostUsd: 1,
	stale: false,
	staleness: [],
	timestamp: REPLAY_IDENTITY.recordedTimestamp,
};

async function writtenReplay(): Promise<{
	readonly runsDirectory: string;
	readonly lineage: string;
	readonly timestamp: string;
}> {
	const runsDirectory = await historyRunsDirectory("rehearse-replay-history-");
	const { lineage, timestamp, runName } = REPLAY_IDENTITY;
	const recordFile = replayRecordFile(runsDirectory, lineage, timestamp);
	await mkdir(join(runsDirectory, "replays", lineage), { recursive: true });
	const paths = benchmarkRunPaths(runsDirectory, runName);
	await mkdir(paths.checkpointsDirectory, { recursive: true });
	await writeHistoryManifest(paths.manifestFile, "build");
	await Bun.write(recordFile, `${JSON.stringify(REPLAY_RECORD)}\n`);

	return { lineage, runsDirectory, timestamp };
}

export { REPLAY_SESSION_ID, REPLAY_EXCHANGE_TEXT, writtenReplay };
