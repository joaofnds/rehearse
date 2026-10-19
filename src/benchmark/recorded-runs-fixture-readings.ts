import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HashedFile } from "./checkpoint";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import type { SessionSpend } from "./stage-session-error";
import { DEFAULT_STAGE_SETTINGS_FILE } from "./stage-settings";

interface CallMetricsReadings {
	readonly input: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly output: number;
}

const EVIDENCE_PREVIEW_CHARACTER_COUNT = 160;

const DEFAULT_RECORDED_REP_COUNT = 1;

const FIRST_FIXTURE_STAGE_INDEX = 0;

const ORDINAL_BASE = 1;

const PREFIX_START_INDEX = 0;

const GROUP_REP_FIXTURES = [
	{ costUsd: 1.25, ordinal: 1 },
	{ costUsd: 2.75, ordinal: 2 },
] as const;

const DEFAULT_RUNNING_STAGE_ELAPSED_MS = 9000;

const DEFAULT_RUNNING_STAGE_SPENT_USD = 0.9;

const FIXTURE_PER_REP_MAXIMUM_USD = 20;

const SHA256_HEX_DIGITS = 64;

const FIXTURE_JSON_INDENT_SPACES = 2;

const GIT_SHA1_HEX_DIGITS = 40;

const CASE_ID = "audit-log";

const SOURCE_ROOT = "/sources/template";

const CORPUS_DIGEST = "a".repeat(SHA256_HEX_DIGITS);

const COMPARISON_DIGEST = "c".repeat(SHA256_HEX_DIGITS);

const STOPPED_STAGE_SESSION_ID = "3d5f9c11-0000-4000-8000-000000000042";

const STOPPED_STAGE_EXCHANGE_TEXT = "the stopped stage answered";

function callMetrics(
	tokens: CallMetricsReadings,
): Immutable<ClaudeCallMetrics> {
	return {
		cacheReadTokens: tokens.cacheRead,
		cacheWriteTokens: tokens.cacheWrite,
		costUsd: 0.1,
		inputTokens: tokens.input,
		outputTokens: tokens.output,
		turns: 1,
	};
}

const STOPPED_RUN_EVIDENCE = {
	buildChangedPaths: ["src/audit-log.ts", "src/audit-log.test.ts"],
	buildCommitSubjects: ["feat: add the audit log module"],
	buildJudgeAttemptMetrics: callMetrics({
		cacheRead: 40,
		cacheWrite: 60,
		input: 4,
		output: 13,
	}),
	buildJudgeHaltedMetrics: callMetrics({
		cacheRead: 70,
		cacheWrite: 80,
		input: 5,
		output: 17,
	}),
	buildSessionMetrics: callMetrics({
		cacheRead: 300,
		cacheWrite: 50,
		input: 2,
		output: 11,
	}),
	discussJudgeMetrics: callMetrics({
		cacheRead: 30,
		cacheWrite: 40,
		input: 3,
		output: 9,
	}),
	discussSessionMetrics: [
		callMetrics({ cacheRead: 100, cacheWrite: 20, input: 10, output: 5 }),
		callMetrics({ cacheRead: 200, cacheWrite: 0, input: 1, output: 7 }),
	],
	taskCard: ".boris/backlog/tasks/task-1 - Add-an-audit-log.md",
	untouchedCard: ".boris/backlog/tasks/task-2 - Rotate-the-audit-log.md",
} as const;

const CEILING_STOPPED_SESSION: SessionSpend = {
	costUsd: 3,
	providerCalls: [{ metrics: STOPPED_RUN_EVIDENCE.buildSessionMetrics }],
};

const RECORDED_READINGS = {
	minimumGrade: "B",
	productOwnerCostUsd: 0.75,
	productOwnerMetrics: callMetrics({
		cacheRead: 400,
		cacheWrite: 60,
		input: 4,
		output: 13,
	}),
	runElapsedMs: 4000,
	stageElapsedMs: { build: 2500, discuss: 1200 },
	stoppedLetter: "F",
} as const;

const STOPPED_RUN_ERROR = "build stage graded F; minimum grade is B";

const FINAL_JUDGE_FAILURE = "the final judge returned no valid grade";

const AWAITING_JUDGE_SESSION_ID = "7c1e4a88-0000-4000-8000-000000000043";

const AWAITING_JUDGE_EXCHANGE_TEXT = "the stage awaiting judgment answered";

const SETTINGS_DIGEST: HashedFile = {
	path: DEFAULT_STAGE_SETTINGS_FILE,
	sha256: "d".repeat(SHA256_HEX_DIGITS),
};

const NO_PROVIDER_PROJECTS = join(tmpdir(), "rehearse-no-provider-projects");

const RUNNING_RUN = "2026-09-07T00-00-00.000Z";

export {
	AWAITING_JUDGE_EXCHANGE_TEXT,
	AWAITING_JUDGE_SESSION_ID,
	CASE_ID,
	CEILING_STOPPED_SESSION,
	COMPARISON_DIGEST,
	CORPUS_DIGEST,
	DEFAULT_RECORDED_REP_COUNT,
	DEFAULT_RUNNING_STAGE_ELAPSED_MS,
	DEFAULT_RUNNING_STAGE_SPENT_USD,
	EVIDENCE_PREVIEW_CHARACTER_COUNT,
	FINAL_JUDGE_FAILURE,
	FIRST_FIXTURE_STAGE_INDEX,
	FIXTURE_JSON_INDENT_SPACES,
	FIXTURE_PER_REP_MAXIMUM_USD,
	GIT_SHA1_HEX_DIGITS,
	GROUP_REP_FIXTURES,
	NO_PROVIDER_PROJECTS,
	ORDINAL_BASE,
	PREFIX_START_INDEX,
	RECORDED_READINGS,
	RUNNING_RUN,
	SETTINGS_DIGEST,
	SHA256_HEX_DIGITS,
	SOURCE_ROOT,
	STOPPED_RUN_ERROR,
	STOPPED_RUN_EVIDENCE,
	STOPPED_STAGE_EXCHANGE_TEXT,
	STOPPED_STAGE_SESSION_ID,
	callMetrics,
};
