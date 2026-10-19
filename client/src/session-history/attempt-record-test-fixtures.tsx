import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import {
	SHA1_HEX_CHARACTERS,
	SHA256_HEX_CHARACTERS,
} from "#client/test-support/digest-widths";
import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { ReplayRow, SessionAttemptRow } from "#server/run-history";

const sha = "a".repeat(SHA256_HEX_CHARACTERS);

function standaloneRow(): SessionAttemptRow {
	return {
		caseId: "case-a",
		corpusVersion: { digest: sha, kind: "version" },
		kind: "session-attempt",
		links: [
			{
				href: "/attempts/session/case-a/attempt-a",
				label: "context",
				state: "available",
			},
		],
		recordId: "attempt:session:case-a/attempt-a",
		shortId: "s01",
		staleness: UNREAD_STALENESS,
		status: "UNSUCCESSFUL",
		uuid: "attempt-a",
		...UNREAD_SESSION_ATTEMPT_FIGURES,
		checks: { declared: 3, passed: 2, state: "available" },
		cost: { missing: [], parts: [], state: "available", usd: 0.37 },
		startedAt: "2026-10-01T12:00:00Z",
		wallTime: { ms: 72_000, state: "available" },
	};
}

function replayRow(): ReplayRow {
	return {
		attempt: { count: 3, position: 2 },
		caseId: "case-a",
		checkpointShortId: "c01",
		corpusVersion: { digest: sha, kind: "version" },
		grade: "B",
		kind: "replay",
		lineage: "lineage-a",
		links: [
			{
				href: "/replays/lineage-a/2026-10-01T12%3A00%3A00Z",
				label: "context",
				state: "available",
			},
		],
		recordId: "attempt:stage:lineage-a/2026-10-01T12:00:00Z",
		shortId: "r01",
		stage: "build",
		staleness: UNREAD_STALENESS,
		status: "CONTINUE",
		timestamp: "2026-10-01T12:00:00Z",
		...UNREAD_REPLAY_FIGURES,
		cost: { missing: [], parts: [], state: "available", usd: 1.24 },
		finalOutcome: {
			reason: "A replay grades only this step.",
			state: "available",
			status: "NOT_APPLICABLE",
		},
		wallTime: { ms: 45_000, state: "available" },
	};
}

function workflowRep(mode: "stage" | "pipeline"): ParsedConfirmationRepRecord {
	const evidence = {
		recordFile: "result.json",
		resultSha: "b".repeat(SHA1_HEX_CHARACTERS),
	};
	return {
		caseId: "case-a",
		elapsedMs: 40_000,
		finalOutcome:
			mode === "pipeline"
				? { evidence, status: "JUDGED", verdict: "PASS" }
				: { status: "NOT_APPLICABLE" },
		groupId: "group-a",
		lineage: { kind: "SOURCE", sha: "c".repeat(SHA1_HEX_CHARACTERS) },
		metrics: {
			calls: [
				{
					metrics: {
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
						costUsd: 0.04,
						inputTokens: 10,
						outputTokens: 2,
						turns: 1,
					},
					role: "worker",
				},
			],
			status: "COMPLETE",
		},
		mode,
		ordinal: 1,
		outcome: "SUCCESSFUL",
		repId: "group-a-rep-1",
		schemaVersion: 1,
		stages: [
			{
				elapsedMs: 30_000,
				evidence,
				grade: "A",
				stage: "build",
				status: "JUDGED",
				verdict: "CONTINUE",
			},
		],
		workerTrajectorySteps: 1,
		worktreePath: "/work/rep",
	};
}

const DETAILED_SESSION_REPETITION = {
	...workflowRep("stage"),
	mode: "session",
	stages: [
		{
			elapsedMs: 10,
			evidence: { recordFile: "attempt.json" },
			grade: "A",
			stage: "checks",
			status: "JUDGED",
			verdict: "CONTINUE",
		},
	],
};

const MEASURED_SESSION_REPETITION = {
	caseId: "case-a",
	elapsedMs: 12_000,
	finalOutcome: { status: "NOT_APPLICABLE" },
	groupId: "group-a",
	lineage: { kind: "SESSION", lineage: "session-lineage" },
	metrics: {
		calls: [
			{
				metrics: {
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					costUsd: 0.02,
					inputTokens: 10,
					outputTokens: 2,
					turns: 1,
				},
				role: "worker",
			},
		],
		status: "COMPLETE",
	},
	mode: "session",
	ordinal: 1,
	outcome: "SUCCESSFUL",
	repId: "group-a-rep-1",
	schemaVersion: 2,
	stages: [
		{
			elapsedMs: 10_000,
			evidence: { recordFile: "attempt.json" },
			grade: "A",
			stage: "checks",
			status: "JUDGED",
			verdict: "CONTINUE",
		},
	],
	workerTrajectorySteps: 1,
};

const ADJACENT_REPETITIONS = {
	caseId: "case-a",
	groupId: "group-a",
	repRecords: [
		{ ordinal: 1, repId: "group-a-rep-1" },
		{ ordinal: 2, repId: "group-a-rep-2" },
	],
};

interface ReplayMetadataExample {
	readonly metadata: string;
	readonly row: Immutable<ReplayRow>;
	readonly title: string;
	readonly caseLabel: string;
	readonly idLabel: string;
}

const REPLAY_METADATA_EXAMPLES: readonly ReplayMetadataExample[] = [
	{
		caseLabel: "case-a",
		idLabel: "r01",
		metadata: "recorded",
		row: replayRow(),
		title: "r01 · case-a · build · replay",
	},
	{
		caseLabel: "Case not recorded",
		idLabel: "ID not recorded",
		metadata: "missing",
		row: { ...replayRow(), caseId: undefined, shortId: undefined },
		title: "Replay · case unavailable · build · replay",
	},
];
export {
	ADJACENT_REPETITIONS,
	DETAILED_SESSION_REPETITION,
	MEASURED_SESSION_REPETITION,
	REPLAY_METADATA_EXAMPLES,
	replayRow,
	standaloneRow,
	workflowRep,
};
export type { ReplayMetadataExample };
