import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
} from "#client/test-support/run-figures";

const CASE_ID_ORDINAL_DIGITS = 2;

const searchCollectionReplies: ReadonlyMap<string, unknown> = new Map([
	[
		"/api/run-listing",
		{
			launches: [],
			rows: [
				{
					...UNREAD_RUN_FIGURES,
					caseId: "audit",
					checkpoints: [],
					corpusChangedDuringRun: false,
					corpusVersion: { digest: "abc", kind: "version" },
					grade: "A",
					kind: "run",
					launchId: undefined,
					links: [],
					progress: {
						spendScope: "this run",
						spentUsd: 0,
						state: "running",
					},
					recordId: "run:audit-run",
					run: "audit-run",
					shortId: "audit/r2",
					stage: "build",
					status: "RUNNING",
				},
				{
					...UNREAD_REPLAY_FIGURES,
					attempt: undefined,
					caseId: "audit",
					checkpointShortId: undefined,
					corpusVersion: { digest: "abc", kind: "version" },
					grade: "C",
					kind: "replay",
					lineage: "lineage",
					links: [
						{
							href: "/comparisons/audit-related",
							label: "comparison",
							state: "available",
						},
						{
							href: "/replays/lineage/audit-replay",
							label: "context",
							state: "available",
						},
					],
					recordId: "replay:lineage/audit-replay",
					shortId: "audit/rp",
					stage: "build",
					status: "STOP",
					timestamp: "audit-replay",
				},
			],
			unreadable: [],
		},
	],
	[
		"/api/cases",
		{
			cases: [{ id: "audit", kind: "session", title: "Audit sessions" }],
			unreadable: [],
			unreadableRecords: [],
		},
	],
	[
		"/api/corpus",
		{
			digest: "abc",
			files: [{ path: "skills/audit.md", sha256: "123" }],
			lastEdit: { kind: "not-recorded", reason: "none" },
			refusals: [],
			root: "/corpus",
		},
	],
	[
		"/api/comparisons",
		{
			comparisons: [
				{
					caseIds: ["audit"],
					digest: "audit-comparison",
					mode: "stage",
					reps: 2,
				},
			],
			unreadable: [],
		},
	],
]);

const matchingRunReplies: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	[
		"/api/cases",
		{
			cases: [{ id: "audit-log", kind: "pipeline", title: "Audit log case" }],
			unreadable: [],
			unreadableRecords: [],
		},
	],
	[
		"/api/run-listing",
		{
			launches: [],
			rows: Array.from({ length: 40 }, (_unused, index) => ({
				...UNREAD_RUN_FIGURES,
				caseId: "audit-log",
				cost: { missing: [], parts: [], state: "available", usd: 1.23 },
				finalOutcome: {
					state: "available",
					status: "JUDGED",
					verdict: "FAIL",
				},
				kind: "run",
				links: [],
				progress: { state: "recorded" },
				recordId: `run:${String(index)}`,
				run: `2026-10-02T09-00-${String(index).padStart(CASE_ID_ORDINAL_DIGITS, "0")}.000Z`,
				status: "COMPLETE",
			})),
			unreadable: [],
		},
	],
]);

const matchingInstructionReplies: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	[
		"/api/cases",
		{
			cases: [{ id: "guide-case", kind: "session", title: "A guide case" }],
			unreadable: [],
			unreadableRecords: [],
		},
	],
	[
		"/api/corpus",
		{
			digest: "abc",
			files: [{ path: "guide", sha256: "123" }],
			lastEdit: { kind: "not-recorded", reason: "none" },
			refusals: [],
			root: "/corpus",
		},
	],
]);

export {
	matchingInstructionReplies,
	matchingRunReplies,
	searchCollectionReplies,
};
