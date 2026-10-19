import type { RunSummaryRecord } from "./record-summary";
import { parseRunSummaryRecord } from "./record-summary";

const RUN_RECORD: RunSummaryRecord = parseRunSummaryRecord(
	JSON.stringify({
		caseId: "audit-log",
		grade: { summary: "the final judge's summary", verdict: "PASS" },
		judgeCostUsd: 1.5,
		productOwnerCostUsd: 0.25,
		stageScorecards: [
			{
				costUsd: 1,
				grade: { grade: "A", verdict: "CONTINUE" },
				stage: "discuss",
			},
			{
				costUsd: 2,
				grade: { grade: "B", verdict: "CONTINUE" },
				stage: "build",
			},
		],
		status: "COMPLETE",
		timestamp: "2026-09-03T00-00-00.000Z",
		workflow: [{ costUsd: 3 }, { costUsd: 4 }],
	}),
);

const QUOTED_STAGE_RECORD = parseRunSummaryRecord(
	JSON.stringify({
		caseId: "audit-log",
		judgeCostUsd: 0,
		productOwnerCostUsd: 0,
		stageScorecards: [
			{
				costUsd: 2,
				grade: {
					dimensions: [
						{
							evidence: [
								{
									claim: "the task is clear",
									path: "backlog-seed.md",
									source: "task",
								},
							],
							grade: "B",
							id: "clarity",
						},
					],
					grade: "B",
					hardBlockers: [
						{
							evidence: [
								{
									claim: "checks pass",
									locator: {
										kind: "harness",
										recorded: true,
										result: "localChecks",
									},
									path: "harness",
									source: "local-checks",
								},
							],
							id: "unfinished-delivery",
							status: "PASS",
						},
					],
					requirements: [
						{
							evidence: [
								{
									claim: "the module is wired",
									locator: {
										file: "src/app.ts",
										hunk: "@@ -1,2 +1,3 @@",
										kind: "hunk",
										occurrences: 2,
									},
									path: "src/app.ts",
									quote: "import {\n  AuditLog }",
									source: "diff",
								},
							],
							id: "scope",
							status: "PASS",
						},
					],
					verdict: "CONTINUE",
				},
				stage: "build",
			},
		],
		status: "STOPPED",
		timestamp: "2026-09-03T00-00-00.000Z",
		workflow: [],
	}),
);

const QUOTED_FINAL_RECORD = parseRunSummaryRecord(
	JSON.stringify({
		caseId: "audit-log",
		grade: {
			requirements: [
				{
					evidence: [
						{
							claim: "the log is tested",
							locator: {
								file: "src/audit.test.ts",
								hunk: "@@ -0,0 +1,9 @@",
								kind: "hunk",
								occurrences: 1,
							},
							path: "src/audit.test.ts",
							quote: "it('records a change')",
							source: "diff",
						},
					],
					id: "tests",
					status: "PASS",
				},
				{
					evidence: [
						{
							claim: "the worker followed the rules",
							path: "CLAUDE.md",
							source: "baseline-context",
						},
					],
					id: "worker",
					status: "PASS",
				},
			],
			summary: "complete",
			verdict: "PASS",
		},
		judgeCostUsd: 0,
		productOwnerCostUsd: 0,
		stageScorecards: [],
		status: "AWAITING_HUMAN_REVIEW",
		timestamp: "2026-09-03T00-00-00.000Z",
		workflow: [],
	}),
);

export { RUN_RECORD, QUOTED_STAGE_RECORD, QUOTED_FINAL_RECORD };
