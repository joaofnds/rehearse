import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { ComparisonReport } from "#benchmark/comparison-record";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";
import type { WhatMovedRow } from "#server/comparison-what-moved";

import { ComparisonPage } from "./comparison-page";
import {
	BASELINE_LAGS,
	CANDIDATE_CLEARS,
	ONE_ATTEMPT_EACH,
	PASSED_EVERY_ATTEMPT,
	arm,
	caseSummary,
} from "./comparison-report-test-fixtures";
import type { ComparisonResponse } from "./comparison-response";

const DECLARED_STATE_CHECK_COUNT = 19;

const DECLARED_REPLY_CHECK_COUNT = 1;

const COMPARISON_ARM_COUNT = 3;

const RETAINED_REPORT_CASE_COUNT = 1;

const PREFIX_START_INDEX = 0;

const missingComparisonResponse = async (): Promise<Response> =>
	await Promise.resolve(Response.json({ error: "not found" }, { status: 404 }));

const originalFetch = globalThis.fetch;

const DIGEST = "d".repeat(SHA256_HEX_CHARACTERS);

type ComparisonResponseFixture = Omit<
	ComparisonResponse,
	"report" | "sessionAssessments" | "qualityReadings"
> & {
	readonly report: Pick<ComparisonReport, "mode" | "cases">;
} & Partial<Pick<ComparisonResponse, "sessionAssessments" | "qualityReadings">>;

const NOT_RECORDED = {
	reasons: ["version not recorded"],
	state: "unavailable",
} as const;

const FINAL_ROW: WhatMovedRow = {
	arms: {
		baseline: { attempts: 1, scale: "successRate", successful: 1 },
		candidate: { attempts: 1, scale: "successRate", successful: 1 },
		control: { attempts: 1, scale: "successRate", successful: 1 },
	},
	kind: "overall",
	name: "final",
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { high: "100%", low: "21%" },
				subtrahend: { high: "100%", low: "21%" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const NO_WORDS = "this report records no word count for its attempts";

const UNRECORDED_LENGTH_ROW: WhatMovedRow = {
	arms: {
		baseline: { reasons: [NO_WORDS], state: "unavailable" },
		candidate: { reasons: [NO_WORDS], state: "unavailable" },
		control: { reasons: [NO_WORDS], state: "unavailable" },
	},
	kind: "meter",
	name: "replyLength",
	readings: {
		candidateMinusBaseline: {
			change: undefined,
			interval: { minuend: undefined, subtrahend: undefined },
			verdict: { kind: "unavailable", reasons: [NO_WORDS] },
		},
	},
};

function comparisonResponseBody(): ComparisonResponseFixture {
	const caseFigures = {
		baseline: PASSED_EVERY_ATTEMPT,
		candidate: PASSED_EVERY_ATTEMPT,
		control: PASSED_EVERY_ATTEMPT,
	};
	const caseVersions = {
		baseline: NOT_RECORDED,
		candidate: NOT_RECORDED,
		control: NOT_RECORDED,
	};

	return {
		armFigures: { "case-1": caseFigures, "case-2": caseFigures },
		attemptHistories: {},
		attempts: { "case-1": ONE_ATTEMPT_EACH, "case-2": ONE_ATTEMPT_EACH },
		attribution: comparisonAttributions(),
		baselineArm: { kind: "supplied" },
		checkpoint: {
			reasons: ["a session comparison replays no single checkpoint"],
			state: "unavailable",
		},
		corpusVersions: { "case-1": caseVersions, "case-2": caseVersions },
		inheritedConfiguration: {
			"case-1": { findings: [], state: "available" },
			"case-2": { findings: [], state: "available" },
		},
		report: recordedCaseReport(),
		summary: {
			"case-1": caseSummary({
				reasons: ["rep-1 lacks worker"],
				state: "unavailable",
			}),
			"case-2": caseSummary({
				reasons: ["rep-1 lacks worker"],
				state: "unavailable",
			}),
		},
		whatMoved: { "case-1": [FINAL_ROW], "case-2": [UNRECORDED_LENGTH_ROW] },
	};
}

function renderPage(
	body: ComparisonResponseFixture = comparisonResponseBody(),
): void {
	stubFetchByPath(new Map([[`/api/comparisons/${DIGEST}`, body]]));
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	renderWithRouter(
		<QueryClientProvider client={client}>
			<ComparisonPage digest={DIGEST} />
		</QueryClientProvider>,
	);
}

function comparisonAttributions(): ComparisonResponseFixture["attribution"] {
	return {
		"case-1": {
			baselineMinusControl: {
				claim: "attributable",
				differingPath: "output-styles/brief.md",
				differingPaths: ["output-styles/brief.md"],
			},
			candidateMinusBaseline: {
				claim: "attributable",
				differingPath: "output-styles/brief.md",
				differingPaths: ["output-styles/brief.md"],
			},
			candidateMinusControl: {
				claim: "attributable",
				differingPath: "output-styles/brief.md",
				differingPaths: ["output-styles/brief.md"],
			},
		},
		"case-2": {
			baselineMinusControl: {
				claim: "refused",
				differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
			},
			candidateMinusBaseline: {
				claim: "refused",
				differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
			},
			candidateMinusControl: {
				claim: "refused",
				differingPaths: ["CLAUDE.md", "skills/discuss/SKILL.md"],
			},
		},
	};
}

function recordedCaseReport(): ComparisonResponseFixture["report"] {
	return {
		cases: [
			{
				arms: {
					baseline: arm("baseline", "1", BASELINE_LAGS),
					candidate: arm("candidate", "2", CANDIDATE_CLEARS),
					control: arm("control", "3", BASELINE_LAGS),
				},
				caseId: "case-1",
			},
			{
				arms: {
					baseline: arm("baseline", "4", BASELINE_LAGS),
					candidate: arm("candidate", "5", CANDIDATE_CLEARS),
					control: arm("control", "6", BASELINE_LAGS),
				},
				caseId: "case-2",
			},
		],
		mode: "session",
	};
}

export {
	COMPARISON_ARM_COUNT,
	DECLARED_REPLY_CHECK_COUNT,
	DECLARED_STATE_CHECK_COUNT,
	DIGEST,
	PREFIX_START_INDEX,
	RETAINED_REPORT_CASE_COUNT,
	comparisonResponseBody,
	missingComparisonResponse,
	originalFetch,
	renderPage,
};
export type { ComparisonResponseFixture };
