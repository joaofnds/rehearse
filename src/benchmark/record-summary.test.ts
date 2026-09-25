import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { buildComparisonReport } from "./comparison-report";
import { parseComparisonReport } from "./comparison-record";
import type { ComparisonEvidence } from "./comparison-evidence";
import type { Immutable } from "./contracts";
import type { GroupRepReadsReading } from "./staleness-report";
import {
	cancellingComparisonEvidenceFixture,
	comparisonEvidenceFixture,
	flatCaseComparisonEvidenceFixture,
	withMissingMetrics,
	singleCaseSessionEvidenceFixture,
	withMissingSessionMetrics,
} from "./comparison-test-fixtures";
import {
	confirmationGroupRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import type {
	GroupReportSummaryRecord,
	RunSummaryRecord,
} from "./record-summary";
import {
	comparisonSummary,
	groupSummary,
	parseGroupReportSummaryRecord,
	parseRunSummaryRecord,
	runSummary,
} from "./record-summary";

const RUN_RECORD: RunSummaryRecord = parseRunSummaryRecord(
	JSON.stringify({
		caseId: "audit-log",
		timestamp: "2026-09-03T00-00-00.000Z",
		status: "COMPLETE",
		grade: { verdict: "PASS", summary: "the final judge's summary" },
		productOwnerCostUsd: 0.25,
		judgeCostUsd: 1.5,
		workflow: [{ costUsd: 3 }, { costUsd: 4 }],
		stageScorecards: [
			{
				stage: "discuss",
				costUsd: 1,
				grade: { grade: "A", verdict: "CONTINUE" },
			},
			{
				stage: "build",
				costUsd: 2,
				grade: { grade: "B", verdict: "CONTINUE" },
			},
		],
	}),
);

const GROUP_RECORD = confirmationGroupRecordSchema.parse({
	schemaVersion: 1,
	caseId: "audit-log",
	groupId: "group-1",
	mode: "stage",
	reps: 2,
	declaredStages: ["build"],
	inputs: {
		lineage: {
			kind: "CHECKPOINT",
			lineage: "lineage-build",
			targetSha: "2".repeat(40),
		},
		files: [
			{
				kind: "corpus",
				path: "inputs/corpus/build/SKILL.md",
				sha256: "a".repeat(64),
			},
		],
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipelinePath: "cases/audit-log/pipelines/default.json",
	},
	projectedCost: { reps: 2, perRepMaximumUsd: 20, totalMaximumUsd: 40 },
	approval: { method: "yes", approved: true },
	repRecords: [1, 2].map((ordinal) => ({
		repId: `group-1-rep-${ordinal}`,
		ordinal,
		path: `reps/group-1-rep-${ordinal}/rep.json`,
	})),
	reportFile: "report.json",
	makespanMs: 200,
});

const GROUP_REPORT: GroupReportSummaryRecord = parseGroupReportSummaryRecord(
	JSON.stringify({
		reliability: [
			{
				name: "build",
				requested: 2,
				successful: 1,
				successRate: 0.5,
				standardError: 0.35355339059327373,
				passK: 0.25,
			},
		],
		resources: { total: { costUsd: [1.25, 2.75] } },
	}),
);

const NO_READS: GroupRepReadsReading = { state: "available", reps: [] };

const SESSION_GROUP_RECORD = parseConfirmationGroupRecord(
	JSON.stringify({
		schemaVersion: 2,
		caseId: "smoke",
		groupId: "session-group",
		mode: "session",
		reps: 2,
		declaredStages: ["checks"],
		inputs: {
			lineage: { kind: "SESSION", lineage: "lineage-1" },
			files: [
				{ kind: "case", path: "inputs/case.json", sha256: "a".repeat(64) },
			],
			model: "sonnet",
			sessionBudgetUsd: 0.2,
		},
		projectedCost: {
			reps: 2,
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			totalMaximumUsd: 0.5,
		},
		preflight: { status: "MISSING", missing: "preflight call metrics" },
		approval: { method: "yes", approved: true },
		repRecords: [1, 2].map((ordinal) => ({
			repId: `session-group-rep-${ordinal}`,
			ordinal,
			path: `reps/session-group-rep-${ordinal}/rep.json`,
		})),
		reportFile: "report.json",
		makespanMs: 100,
	}),
);

describe(runSummary.name, () => {
	it("renders the stages, their grades, the verdict, and the total cost", () => {
		expect(runSummary("2026-09-03T00-00-00.000Z", RUN_RECORD)).toBe(
			`## run:2026-09-03T00-00-00.000Z

Case audit-log, status COMPLETE.

| stage | grade | verdict | cost |
| --- | --- | --- | --- |
| discuss | A | CONTINUE | $1.00 |
| build | B | CONTINUE | $2.00 |

Final verdict PASS.
Total cost $11.75.
`,
		);
	});
});

describe(groupSummary.name, () => {
	it("renders the reliability summary and the group's cost", () => {
		expect(groupSummary(GROUP_RECORD, GROUP_REPORT, NO_READS)).toBe(
			`## group:group-1

Case audit-log, stage mode, 2 reps.
Corpus version not recorded.

| outcome | successful | success rate | standard error | pass^k |
| --- | --- | --- | --- | --- |
| build | 1/2 | 0.500 | 0.354 | 0.250 |

Cost $4.00 over 2 reps.

No rep recorded a read.
`,
		);
	});

	it("lists each rep stage's reads with whether each file changed since", () => {
		const reads: GroupRepReadsReading = {
			state: "available",
			reps: [
				{
					repId: "group-1-rep-1",
					stage: "build",
					readManifest: [
						{
							path: "skills/build/SKILL.md",
							half: "corpus",
							role: "stage skill",
							evidence: "declared and observed",
							sha256: "b".repeat(64),
							state: "changed",
						},
						{
							path: "CLAUDE.md",
							half: "project",
							role: "project instructions",
							evidence: "observed",
							sha256: "c".repeat(64),
						},
					],
				},
				{
					repId: "group-1-rep-2",
					readManifest: [
						{
							path: "output-styles/brief.md",
							half: "corpus",
							role: "global instructions",
							evidence: "declared",
							sha256: "d".repeat(64),
							state: "unchanged",
						},
					],
				},
			],
		};

		expect(groupSummary(GROUP_RECORD, GROUP_REPORT, reads)).toContain(
			`| rep | stage | path | role | evidence | state |
| --- | --- | --- | --- | --- | --- |
| group-1-rep-1 | build | skills/build/SKILL.md | stage skill | declared and observed | changed |
| group-1-rep-1 | build | CLAUDE.md | project instructions | observed | not judged |
| group-1-rep-2 | session | output-styles/brief.md | global instructions | declared | unchanged |
`,
		);
	});

	it("names why the reps' reads could not be judged", () => {
		expect(
			groupSummary(GROUP_RECORD, GROUP_REPORT, {
				state: "unavailable",
				reasons: ["the group froze no pipeline to hash its stages against"],
			}),
		).toContain(
			"\nReads not judged: the group froze no pipeline to hash its stages against.\n",
		);
	});

	it("names the corpus version the group ran against", () => {
		const record = confirmationGroupRecordSchema.parse({
			...GROUP_RECORD,
			inputs: {
				...GROUP_RECORD.inputs,
				corpusVersion: { kind: "version", digest: `4e196b${"0".repeat(58)}` },
			},
		});

		expect(groupSummary(record, GROUP_REPORT, NO_READS)).toContain(
			"\nCorpus corpus@4e196b.\n",
		);
	});

	it("names the refusal that kept the group's corpus from being a version", () => {
		const record = confirmationGroupRecordSchema.parse({
			...GROUP_RECORD,
			inputs: {
				...GROUP_RECORD.inputs,
				corpusVersion: {
					kind: "refused",
					refusal: "a symlink escapes the root",
				},
			},
		});

		expect(groupSummary(record, GROUP_REPORT, NO_READS)).toContain(
			"\nCorpus refused: a symlink escapes the root.\n",
		);
	});

	it("does not present a rep-only number as command cost when preflight metrics are missing", () => {
		const report = parseGroupReportSummaryRecord(
			JSON.stringify({
				...GROUP_REPORT,
				resources: {
					total: { costUsd: [1.25, 2.75] },
					commandTotal: {
						status: "MISSING",
						missing: ["preflight call metrics"],
					},
				},
			}),
		);

		expect(groupSummary(GROUP_RECORD, report, NO_READS)).toContain(
			"Cost unavailable: preflight call metrics.",
		);
		expect(groupSummary(GROUP_RECORD, report, NO_READS)).not.toContain(
			"Cost $4.00",
		);
	});

	it("does not fall back to rep-only cost when a v2 session report omits its command total", () => {
		expect(
			groupSummary(SESSION_GROUP_RECORD, GROUP_REPORT, NO_READS),
		).toContain("Cost unavailable: command total evidence is missing.");
	});
});

describe(comparisonSummary.name, () => {
	it("renders every paired delta beside the contrast against the control arm", () => {
		const report = buildComparisonReport(comparisonEvidenceFixture(), {
			skippedCalibrations: 0,
			baselines: [],
		});

		expect(comparisonSummary("c".repeat(64), report)).toBe(
			`## comparison:${"c".repeat(64)}

2 cases, pipeline mode, 4 reps.

| contrast | outcome | success rate Δ | standard error | pass^k Δ | per-case Δ | reading |
| --- | --- | --- | --- | --- | --- | --- |
| candidate − baseline | discuss | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − baseline | build | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − baseline | final | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |
| candidate − control | discuss | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| candidate − control | build | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| candidate − control | final | +1.000 | 0.000 | +1.000 | case-1 +1.000, case-2 +1.000 |  |
| baseline − control | discuss | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |
| baseline − control | build | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |
| baseline − control | final | +0.500 | 0.000 | +0.063 | case-1 +0.500, case-2 +0.500 |  |

| contrast | cost Δ (USD) | standard error | per-case Δ |
| --- | --- | --- | --- |
| candidate − baseline | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
| candidate − control | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
| baseline − control | +0.000000 | 0.000000 | case-1 +0.000000, case-2 +0.000000 |
`,
		);
	});

	it("names the disagreement when per-case deltas cancel to a zero mean", () => {
		const report = buildComparisonReport(
			cancellingComparisonEvidenceFixture(),
			{ skippedCalibrations: 0, baselines: [] },
		);

		const summary = comparisonSummary("c".repeat(64), report);

		// The mean alone is +0.000 here, identical to two cases that did not
		// move. The per-case deltas and the reading are what separate them.
		expect(summary).toContain(
			"| candidate − baseline | discuss | +0.000 | 0.500 | +0.000 | case-1 +0.500, case-2 -0.500 | cases disagree |",
		);
	});

	it("renders a cost table whose standard error reflects the per-case spread", () => {
		const report = buildComparisonReport(
			cancellingComparisonEvidenceFixture(),
			{ skippedCalibrations: 0, baselines: [] },
		);

		const summary = comparisonSummary("c".repeat(64), report);

		// The mean and its standard error both reach the rendered row. These
		// fixture costs are whole-dollar scale, so this pins the figures and
		// the six-decimal format, not the sub-cent regime that format exists
		// for; the live report 511cd2c4 is the evidence for that regime.
		expect(summary).toContain(
			"| candidate − baseline | +3.750000 | 1.250000 | case-1 +5.000000, case-2 +2.500000 |",
		);
		expect(summary).toContain(
			"| candidate − control | -1.250000 | 3.750000 | case-1 +2.500000, case-2 -5.000000 |",
		);
	});

	it("reports an unavailable cost row rather than a zero delta", () => {
		const evidence = cancellingComparisonEvidenceFixture();
		const [benchmarkCase, ...otherCases] = evidence.cases;
		if (benchmarkCase === undefined) {
			throw new Error("the fixture carries no case");
		}
		const [firstRep, ...otherReps] = benchmarkCase.arms.candidate.reps;
		if (firstRep === undefined || firstRep.record.schemaVersion !== 1) {
			throw new Error("the candidate arm carries no pipeline rep");
		}

		const report = buildComparisonReport(
			{
				...evidence,
				cases: [
					{
						...benchmarkCase,
						arms: {
							...benchmarkCase.arms,
							candidate: {
								...benchmarkCase.arms.candidate,
								reps: [
									{
										...firstRep,
										record: withMissingMetrics(
											firstRep.record,
											"worker call metrics",
										),
									},
									...otherReps,
								],
							},
						},
					},
					...otherCases,
				],
			},
			{ skippedCalibrations: 0, baselines: [] },
		);

		const summary = comparisonSummary("c".repeat(64), report);

		// A missing measurement must not read as "this edit cost nothing".
		expect(summary).toContain(
			"| candidate − baseline | unavailable | unavailable | unavailable |",
		);
	});

	it("reads a case that did not move as agreement, not disagreement", () => {
		const report = buildComparisonReport(flatCaseComparisonEvidenceFixture(), {
			skippedCalibrations: 0,
			baselines: [],
		});

		const summary = comparisonSummary("c".repeat(64), report);

		// case-2's delta is exactly 0.000 beside a positive case. Reading this
		// as a disagreement would mean a case that did not move counts as
		// conflict, which is what relaxing the negative comparison to <= does.
		expect(summary).toContain("case-1 +0.500, case-2 +0.000");
		expect(summary).not.toContain("cases disagree");

		// The mirror, so that relaxing the POSITIVE comparison to >= is caught
		// as well: the same zero beside a negative delta. Without this row only
		// one side of caseDeltasDisagree is pinned.
		expect(summary).toContain("case-1 -0.500, case-2 +0.000");
	});

	it("leaves the reading blank when every per-case delta shares a sign", () => {
		const report = buildComparisonReport(comparisonEvidenceFixture(), {
			skippedCalibrations: 0,
			baselines: [],
		});

		const summary = comparisonSummary("c".repeat(64), report);

		expect(summary).not.toContain("cases disagree");
		expect(summary).toContain(
			"| candidate − baseline | discuss | +0.500 | 0.000 | +0.938 | case-1 +0.500, case-2 +0.500 |  |",
		);
	});
});

function withMissingCandidateMetrics(
	evidence: Immutable<ComparisonEvidence>,
): ComparisonEvidence {
	const [benchmarkCase] = evidence.cases;
	if (benchmarkCase === undefined) {
		throw new Error("the fixture carries no case");
	}
	const [first, ...rest] = benchmarkCase.arms.candidate.reps;
	if (first === undefined || first.record.schemaVersion !== 2) {
		throw new Error("the candidate arm carries no session rep");
	}

	return {
		...evidence,
		cases: [
			{
				...benchmarkCase,
				arms: {
					...benchmarkCase.arms,
					candidate: {
						...benchmarkCase.arms.candidate,
						reps: [
							{
								...first,
								record: withMissingSessionMetrics(
									first.record,
									"worker call metrics",
								),
							},
							...rest,
						],
					},
				},
			},
		],
	};
}

describe(`${comparisonSummary.name} for a single case`, () => {
	const JUDGE_AGREEMENT = { skippedCalibrations: 0, baselines: [] } as const;

	it("names its elapsed figure as per-attempt beside the cost delta", () => {
		const report = buildComparisonReport(
			singleCaseSessionEvidenceFixture({
				baseline: [
					{ costUsd: 0.02, elapsedMs: 1000 },
					{ costUsd: 0.02, elapsedMs: 3000 },
				],
				candidate: [
					{ costUsd: 0.02, elapsedMs: 5000 },
					{ costUsd: 0.02, elapsedMs: 7000 },
				],
				control: [
					{ costUsd: 0.02, elapsedMs: 1000 },
					{ costUsd: 0.02, elapsedMs: 3000 },
				],
			}),
			JUDGE_AGREEMENT,
		);

		expect(comparisonSummary("d".repeat(64), report)).toBe(
			`## comparison:${"d".repeat(64)}

1 case, session mode, 2 reps.

Sampling unit: rep. Arms are independent samples; this estimate covers case case-one only.

| arm | successful | success rate | 95% interval | pass^k |
| --- | --- | --- | --- | --- |
| baseline | 2/2 | 1.000 | 0.342-1.000 | 1.000 |
| candidate | 2/2 | 1.000 | 0.342-1.000 | 1.000 |
| control | 2/2 | 1.000 | 0.342-1.000 | 1.000 |

| contrast | outcome | success rate Δ | standard error | pass^k Δ |
| --- | --- | --- | --- | --- |
| candidate − baseline | checks | +0.000 | 0.000 | +0.000 |
| candidate − control | checks | +0.000 | 0.000 | +0.000 |
| baseline − control | checks | +0.000 | 0.000 | +0.000 |

| contrast | cost Δ | standard error | per-attempt elapsed Δ (ms) | standard error |
| --- | --- | --- | --- | --- |
| candidate − baseline | +0.000 | no observed spread | +4000.000 | 1414.214 |
| candidate − control | +0.000 | no observed spread | +4000.000 | 1414.214 |
| baseline − control | +0.000 | no observed spread | +0.000 | 1414.214 |
`,
		);
	});

	it("reports elapsed as unavailable for a report saved before version 5", async () => {
		const legacy = parseComparisonReport(
			await Bun.file(
				join(
					import.meta.dir,
					"fixtures",
					"version-four-single-case-report.json",
				),
			).text(),
		);
		if (legacy.schemaVersion !== 4 || !("samplingUnit" in legacy)) {
			throw new Error("expected a single-case version-four report");
		}

		const summary = comparisonSummary("e".repeat(64), legacy);

		expect(summary).toContain(
			"| candidate − baseline | +0.000 | no observed spread | unavailable | unavailable |",
		);
		expect(summary).not.toContain("no observed spread | +0.000");
	});

	it("reports elapsed as unavailable for an arm whose rep metrics are missing", () => {
		const evidence = singleCaseSessionEvidenceFixture({
			baseline: [
				{ costUsd: 0.02, elapsedMs: 1000 },
				{ costUsd: 0.02, elapsedMs: 3000 },
			],
			candidate: [
				{ costUsd: 0.02, elapsedMs: 5000 },
				{ costUsd: 0.02, elapsedMs: 7000 },
			],
			control: [
				{ costUsd: 0.02, elapsedMs: 1000 },
				{ costUsd: 0.02, elapsedMs: 3000 },
			],
		});
		const report = buildComparisonReport(
			withMissingCandidateMetrics(evidence),
			JUDGE_AGREEMENT,
		);
		const [benchmarkCase] = report.cases;

		expect(benchmarkCase?.arms.candidate.resources).toMatchObject({
			status: "UNAVAILABLE",
			missingMetricReps: 1,
		});
		expect(comparisonSummary("f".repeat(64), report)).toContain(
			"| candidate − baseline | unavailable | unavailable | unavailable | unavailable |",
		);
	});
});
