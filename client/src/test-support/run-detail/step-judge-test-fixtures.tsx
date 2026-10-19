import type { RunRecord } from "#server/run-record";
import { INTERRUPTED_REASON } from "#server/run-record";
import type { StageJudge } from "#server/stage-judge";

const BUILD_HARD_BLOCKERS: Extract<
	StageJudge,
	{ readonly state: "judged" }
>["hardBlockers"] = [
	{
		evidence: [
			{
				claim: "The agent chose a scope without asking",
				path: "transcript",
				place: "exchange 3 message, characters 0-25",
				quote: "I'll take the small scope",
				source: "transcript",
			},
		],
		id: "scope-declared-before-edit",
		status: "FAIL",
	},
	{ evidence: [], id: "no-secrets-in-diff", status: "PASS" },
	{
		evidence: [
			{
				claim: "The handoff left a failing test",
				path: "src/auth/tokens.ts",
				source: "diff",
			},
		],
		id: "tests-pass-before-handoff",
		status: "FAIL",
	},
];

function buildJudged(): StageJudge {
	return {
		dimensions: [
			{
				evidence: [
					{
						claim: "Edits files outside the declared scope",
						path: "src/a.ts",
						place: "src/a.ts:3-4",
						source: "diff",
					},
					{
						claim: "Never restates the scope",
						path: "transcript",
						source: "transcript",
					},
				],
				grade: "C",
				id: "scope-discipline",
			},
			{ evidence: [], grade: "B", id: "test-quality" },
		],
		hardBlockers: BUILD_HARD_BLOCKERS,
		state: "judged",
	};
}

interface WaitingJudgeExample {
	readonly run: string;
	readonly status: string;
	readonly finalOutcome: RunRecord["finalOutcome"];
	readonly words: string;
	readonly verdict: string;
}

const WAITING_JUDGE_EXAMPLES: readonly WaitingJudgeExample[] = [
	{
		finalOutcome: {
			reason: INTERRUPTED_REASON,
			stage: "build",
			status: "NOT_REACHED",
		},
		run: "an ended run",
		status: "INTERRUPTED",
		verdict:
			"Verdict⊘judge never returnedblockers not recorded: the run ended while this stage awaited judgment",
		words:
			"This step's judge never returned: the run ended while this stage awaited judgment.",
	},
	{
		finalOutcome: { stage: "build", status: "PENDING" },
		run: "a run in flight",
		status: "RUNNING",
		verdict: "Verdict◌awaiting judgmentblockers pending",
		words:
			"This step's judge has not returned its blockers and dimensions yet.",
	},
];
export { buildJudged, WAITING_JUDGE_EXAMPLES };
export type { WaitingJudgeExample };
