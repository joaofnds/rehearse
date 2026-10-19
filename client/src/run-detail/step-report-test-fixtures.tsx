import { screen, within } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { AppRouter } from "#client/test-support/render-app";
import {
	RUN,
	RunRecordBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";
import { buildJudged } from "#client/test-support/run-detail/step-judge-test-fixtures";
import type { RunRecord, RunRecordStage } from "#server/run-record";
import type { StageAttempts } from "#server/stage-attempts";
import type { StageSession } from "#server/stage-session";

const BUILD_ATTEMPTS = `/api/runs/${RUN}/stages/build/attempts`;

const DIGEST = "c0ffee".padEnd(SHA256_HEX_CHARACTERS, "0");

/** A replay and a confirmation rep at build's checkpoint beside the original run. */
const BUILD_ATTEMPT_SERIES: StageAttempts = {
	attempts: [
		{
			id: "audit-log/r2",
			kind: "original",
			staleness: {
				causes: ["skills/build/SKILL.md changed"],
				changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
				distance: { kind: "measured", versions: 1 },
				onlyCorpusFiles: true,
				stale: true,
				state: "available",
			},
		},
		{
			corpusVersion: { digest: DIGEST, kind: "version" },
			grade: "B",
			id: "audit-log/r3",
			kind: "replay",
			staleness: {
				causes: [],
				changedFiles: [],
				distance: { kind: "measured", versions: 0 },
				onlyCorpusFiles: true,
				stale: false,
				state: "available",
			},
		},
		{
			corpusVersion: { digest: DIGEST, kind: "version" },
			grade: "C",
			id: "audit-log/r4",
			kind: "replay",
			staleness: {
				causes: [],
				changedFiles: [],
				distance: { kind: "measured", versions: 2 },
				onlyCorpusFiles: true,
				stale: false,
				state: "available",
			},
		},
		{
			corpusVersion: undefined,
			grade: "A",
			id: "audit-log/g5 rep 1",
			kind: "rep",
			staleness: {
				reasons: ["the group froze no pipeline to hash its stages against"],
				state: "unavailable",
			},
		},
	],
	checkpoint: "audit-log/r2/s1",
};

const NO_CITED_REPORT_BUTTONS = 0;

const originalFetch = globalThis.fetch;

const BUILD_JUDGE = `/api/runs/${RUN}/stages/build/judge`;

const BUILD_SESSION = `/api/runs/${RUN}/stages/build/session`;

const SKILL_HASH = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

const BUILD_READ_MANIFEST: RunRecordStage["readManifest"] = {
	entries: [
		{
			evidence: "declared and observed",
			half: "corpus",
			path: "skills/implement/SKILL.md",
			role: "stage skill",
			sha256: SKILL_HASH,
			state: "unchanged",
		},
		{
			evidence: "observed",
			half: "corpus",
			path: "skills/review/SKILL.md",
			role: "read for context",
			sha256: "9f30d1".padEnd(SHA256_HEX_CHARACTERS, "0"),
			state: "changed",
		},
		{
			evidence: "observed",
			half: "project",
			path: "CLAUDE.md",
			role: "project instructions",
			sha256: "77aa01".padEnd(SHA256_HEX_CHARACTERS, "0"),
		},
		{
			evidence: "declared",
			half: "corpus",
			path: "CLAUDE.md",
			role: "global instructions",
		},
		{
			evidence: "observed",
			half: "corpus",
			path: "skills/plan/SKILL.md",
			role: "read for context",
			sha256: "5be0c2".padEnd(SHA256_HEX_CHARACTERS, "0"),
		},
	],
	state: "available",
};

/** The stopped run with shape's checkpoint, wall time and cost recorded. */
function stoppedWithFigures(): RunRecord {
	return new RunRecordBuilder(stoppedAtBuild())
		.withStage({
			checkpointShortId: { shortId: "c-0147-1", state: "available" },
			judgeCost: { state: "available", usd: 0.1 },
			sessionCost: { state: "available", usd: 1.02 },
			stage: "shape",
			wallTime: { ms: 242_000, state: "available" },
		})
		.build();
}

/** The stopped run with build's figures and reads recorded. */
function stoppedWithBuildFigures(): RunRecord {
	return new RunRecordBuilder(stoppedAtBuild())
		.withStage({
			judgeCost: { state: "available", usd: 0.12 },
			readManifest: BUILD_READ_MANIFEST,
			sessionCost: { state: "available", usd: 1 },
			stage: "build",
			wallTime: { ms: 242_000, state: "available" },
		})
		.build();
}

function closedSession(): StageSession {
	return {
		lineCount: 1284,
		spans: [],
		state: "closed",
		transcriptPath: `.benchmark-runs/${RUN}.build.session/transcript.jsonl`,
	};
}

interface BuildReportRequest {
	readonly record?: RunRecord;
	readonly session?: StageSession;
	readonly extra?: ReadonlyMap<string, unknown>;
}

function renderBuildReport({
	record = stoppedWithBuildFigures(),
	session = closedSession(),
	extra = new Map(),
}: BuildReportRequest = {}): AppRouter {
	return renderRunDetail(
		new Map<string, unknown>([
			[`/api/runs/${RUN}`, record],
			[BUILD_JUDGE, buildJudged()],
			[BUILD_SESSION, session],
			...extra,
		]),
	);
}

async function stepReport(): Promise<HTMLElement> {
	const report = await screen.findByRole("region", { name: "Step report" });
	await within(report).findByRole("list", { name: "Hard blockers" });

	return report;
}

async function stepButtons(): Promise<readonly HTMLElement[]> {
	const graph = await screen.findByRole("region", { name: "Task graph" });

	return within(graph).getAllByRole("button", {
		name: /^(?:shape|build|verify)/u,
	});
}

export {
	BUILD_ATTEMPTS,
	BUILD_ATTEMPT_SERIES,
	BUILD_JUDGE,
	BUILD_SESSION,
	NO_CITED_REPORT_BUTTONS,
	closedSession,
	originalFetch,
	renderBuildReport,
	stepButtons,
	stepReport,
	stoppedWithBuildFigures,
	stoppedWithFigures,
};
