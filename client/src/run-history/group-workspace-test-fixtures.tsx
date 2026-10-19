import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import {
	SHA1_HEX_CHARACTERS,
	SHA256_HEX_CHARACTERS,
} from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import {
	UNREAD_GROUP_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { ConfirmationGroupRow } from "#server/run-history";

import type { GroupReads } from "./group-workspace";

const originalFetch = globalThis.fetch;

const GROUP = "group-a";

const RUN = "2026-09-06T21-58-29.508Z";

interface ServedGroupEvidence {
	readonly reads?: Immutable<GroupReads> | undefined;
	readonly extra?: ReadonlyMap<string, unknown> | undefined;
}

const GROUP_STAGE_SUMMARIES: ConfirmationGroupRow["stageSummaries"] = [
	{
		graded: 2,
		grades: { highest: "A", lowest: "C", median: "B", state: "available" },
		stage: "build",
		ungraded: { JUDGING_FAILED: 1 },
	},
];

const SESSION_ASSESSMENT_REPLIES = new Map<string, unknown>([
	[
		"/api/attempt-evidence/rep%3Asession%3Agroup-a%2Frep-1",
		{
			kind: "session",
			record: {
				caseId: "audit-log",
				checks: [
					{
						detail: "Allowed calls.",
						kind: "tool-calls",
						status: "PASS",
					},
				],
				outcome: "SUCCESSFUL",
				stateResults: [
					{ detail: "Missing state.", name: "preserved", status: "FAIL" },
				],
			},
			state: "available",
		},
	],
	[
		"/api/attempt-evidence/rep%3Asession%3Agroup-a%2Frep-2",
		{
			kind: "session",
			record: {
				caseId: "audit-log",
				checks: [],
				outcome: "SUCCESSFUL",
				stateResults: [
					{ detail: "Present.", name: "preserved", status: "PASS" },
				],
			},
			state: "available",
		},
	],
]);

function group(
	overrides: Partial<ConfirmationGroupRow> = {},
): ConfirmationGroupRow {
	return {
		kind: "group",
		recordId: `group:${GROUP}`,
		...UNREAD_GROUP_FIGURES,
		caseId: "audit-log",
		checkpoint: { run: RUN, stage: "build" },
		corpusVersion: {
			digest: "a".repeat(SHA256_HEX_CHARACTERS),
			kind: "version",
		},
		cost: {
			missing: [{ part: "rep-2", reason: "record unreadable" }],
			parts: [],
			state: "available",
			usd: 6,
		},
		finalOutcomes: { NOT_APPLICABLE: 3 },
		groupId: GROUP,
		links: [
			{
				label: "rep 1",
				reason: "a stage group has no session context",
				state: "unavailable",
			},
			{
				label: "rep 2",
				reason: "no attempt recorded for rep-2",
				state: "unavailable",
			},
		],
		mode: "stage",
		pipelineStages: { stages: ["shape", "build"], state: "available" },
		repAttempts: [{ attempt: { count: 4, position: 2 }, repId: "rep-1" }],
		reps: 3,
		shortId: "g1",
		stageSummaries: GROUP_STAGE_SUMMARIES,
		staleness: UNREAD_STALENESS,
		startedAt: "2026-10-01T12:00:00Z",
		successful: 2,
		unreadReps: [{ reason: "record unreadable", repId: "rep-2" }],
		wallTime: { ms: 90_000, state: "available" },
		...overrides,
	};
}

function serve(
	row: ConfirmationGroupRow,
	{ reads, extra = new Map() }: ServedGroupEvidence = {},
	page = `/groups/${GROUP}`,
): void {
	const source = new RunRecordBuilder({
		run: RUN,
		stages: [
			new RunRecordStageBuilder({
				corpusVersion: {
					digest: "b".repeat(SHA256_HEX_CHARACTERS),
					kind: "version",
				},

				grade: {
					letter: "A",
					reachesMinimum: true,
					state: "available",
					verdict: "CONTINUE",
				},

				judgeCost: { state: "available", usd: 0.3 },

				sessionCost: { state: "available", usd: 1.2 },

				stage: "build",

				status: "graded",

				wallTime: { ms: 30_000, state: "available" },
			}).build(),
		],
	}).build();
	renderAppWithStub(
		page,
		new Map<string, unknown>([
			["/api/runs", { launches: [], rows: [row], unreadable: [] }],
			[`/api/groups/${GROUP}/reads`, reads ?? { reasons: [], reps: [] }],
			[`/api/runs/${RUN}`, source],
			...extra,
		]),
	);
}

function serveSessionAssessment(view: "results" | "attempts"): void {
	serve(
		group({
			checkpoint: undefined,
			mode: "session",
			repAttempts: [
				{ attempt: { count: 3, position: 1 }, repId: "rep-1" },
				{ attempt: { count: 3, position: 2 }, repId: "rep-2" },
				{ attempt: { count: 3, position: 3 }, repId: "rep-3" },
			],
			successful: 3,
		}),
		{
			extra: SESSION_ASSESSMENT_REPLIES,
			reads: undefined,
		},
		`/groups/${GROUP}?view=${view}`,
	);
}

const UNGRADED_REP_ID = "group-a-rep-2";

const UNGRADED_REPETITION: ParsedConfirmationRepRecord = {
	caseId: "audit-log",
	elapsedMs: 12_000,
	finalOutcome: { status: "NOT_APPLICABLE" },
	groupId: GROUP,
	lineage: { kind: "SOURCE", sha: "c".repeat(SHA1_HEX_CHARACTERS) },
	metrics: {
		calls: [],
		missing: ["worker metrics absent"],
		status: "MISSING",
	},
	mode: "stage",
	ordinal: 2,
	outcome: "UNSUCCESSFUL",
	repId: UNGRADED_REP_ID,
	schemaVersion: 1,
	stages: [
		{
			reason: "execution stopped earlier",
			stage: "build",
			status: "NOT_REACHED",
		},
	],
	workerTrajectorySteps: 0,
	worktreePath: "/work/rep",
};

export {
	GROUP,
	group,
	originalFetch,
	RUN,
	serve,
	serveSessionAssessment,
	UNGRADED_REP_ID,
	UNGRADED_REPETITION,
};
