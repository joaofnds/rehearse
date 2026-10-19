import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

const STAGE_CORPUS_REPLIES: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	[
		"/api/runs/run-1/stages/shape/history",
		{
			attempt: {
				caseId: "case-a",
				corpusFiles: [],
				kind: "stage",
				lineage: "lineage-1",
				model: "sonnet",
				run: "run-1",
				stage: "shape",
				upstream: "upstream-1",
			},
			attemptEvents: [],
			boundary: "known",
			boundaryUnknown: [],
			evidence: { state: "complete" },
			schemaVersion: 1,
			sources: [],
			startingContext: [],
			startingSources: [],
		},
	],
	[
		"/api/runs/run-1/stages/shape/history/corpus",
		[
			{
				firstLocator: { block: 1, line: 1 },
				path: "CLAUDE.md",
				state: "observed",
			},
			{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
			{
				firstLocator: { block: 1, line: 3 },
				path: "agents/reviewer.md",
				state: "undeclared",
			},
		],
	],
]);

const STOPPED_STAGE_REPLIES: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	[
		"/api/runs/run-1/stages/build/history/corpus",
		[{ path: "CLAUDE.md", state: "no-observation-recorded" }],
	],
	[
		"/api/runs/run-1/stages/build/history",
		{
			attempt: {
				caseId: "case-a",
				corpusFiles: [
					{
						path: "CLAUDE.md",
						sha256: "a".repeat(SHA256_HEX_CHARACTERS),
					},
				],
				error: "build stage graded C; minimum grade is B",
				kind: "stopped-stage",
				model: "sonnet",
				run: "run-1",
				stage: "build",
			},
			attemptEvents: [],
			boundary: "known",
			boundaryUnknown: [],
			evidence: {
				reasons: ["this stage stopped before recording a transcript"],
				state: "unavailable",
			},
			schemaVersion: 1,
			sources: [],
			startingContext: [],
			startingSources: [],
		},
	],
]);

const AWAITING_JUDGE_REPLIES: ReadonlyMap<string, unknown> = new Map<
	string,
	unknown
>([
	["/api/runs/run-1/stages/build/history/corpus", []],
	[
		"/api/runs/run-1/stages/build/history",
		{
			attempt: {
				caseId: "case-a",
				corpusFiles: [],
				kind: "awaiting-judge-stage",
				model: "sonnet",
				run: "run-1",
				stage: "build",
			},
			attemptEvents: [],
			boundary: "known",
			boundaryUnknown: [],
			evidence: {
				reasons: [
					"this stage ran and its judging never completed, so no transcript was recorded",
				],
				state: "unavailable",
			},
			schemaVersion: 1,
			sources: [],
			startingContext: [],
			startingSources: [],
		},
	],
]);

export { AWAITING_JUDGE_REPLIES, STAGE_CORPUS_REPLIES, STOPPED_STAGE_REPLIES };
