import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
	singleGroupSource,
} from "#benchmark/comparison-legacy-report-test-fixtures";
import {
	COMPARISON_ARMS,
	parseComparisonReport,
} from "#benchmark/comparison-record";
import type { ComparisonReport } from "#benchmark/comparison-record";
import { comparisonReportPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

const EXPECTED_BASELINE_REQUESTED_REPS = 4;

const EXPECTED_BASELINE_SUCCESSFUL_REPS = 2;

const EXPECTED_BASELINE_D_GRADE_COUNT = 2;

const FIRST_QUALITY_SUMMARY_INDEX = 0;

const FIRST_REPORTED_CASE_INDEX = 0;

const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

const LEGACY_COMPARISON_REPORT_VERSION = 1;

const JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION = 2;

async function rewriteFixtureAsSession(
	fixture: RecordedRunsFixture,
): Promise<void> {
	const { reportFile, report: pipeline } = await pipelineFixture(fixture);

	const session = {
		...pipeline,
		cases: pipeline.cases.map(({ caseId, arms }) => ({
			arms: Object.fromEntries(
				COMPARISON_ARMS.map((role) => [
					role,
					{
						...arms[role],
						executedCorpus:
							role === "control"
								? []
								: arms[role].executedCorpus.map((file) => ({
										...file,
										path: "inputs/corpus/output-styles/brief.md",
									})),
						quality: [
							{
								...arms[role].quality[FIRST_QUALITY_SUMMARY_INDEX],
								name: "checks",
							},
						],
						resources: armResourcesWithoutElapsed(arms[role].resources),
						source: sessionFixtureSource(arms[role].source),
					},
				]),
			),
			caseId,
		})),
		contrasts: sessionFixtureContrasts(pipeline.contrasts),
		declaredStages: ["checks"],
		judgeAgreement: { ...pipeline.judgeAgreement, baselines: [] },
		mode: "session",
		schemaVersion: 3,
	};
	const sessionText = `${JSON.stringify(session, null, RECORD_JSON_INDENT_SPACES)}\n`;

	parseComparisonReport(sessionText);
	await Bun.write(reportFile, sessionText);
}

/**
 * Makes one of the baseline arm's two failed attempts one that was never
 * reached, so it carries no grade: counted by success it is still a failure,
 * while a ranking by grade would see three attempts instead of four.
 */
async function leaveOneBaselineAttemptUnreached(
	fixture: RecordedRunsFixture,
): Promise<void> {
	const { reportFile } = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);
	const report = parseComparisonReport(await Bun.file(reportFile).text());
	const [checks] =
		report.cases[FIRST_REPORTED_CASE_INDEX]?.arms.baseline.quality ?? [];
	if (
		checks?.requested !== EXPECTED_BASELINE_REQUESTED_REPS ||
		checks.successful !== EXPECTED_BASELINE_SUCCESSFUL_REPS ||
		checks.gradeDistribution["D"] !== EXPECTED_BASELINE_D_GRADE_COUNT
	) {
		throw new Error("expected the fixture's baseline to hold 2 of 4 successes");
	}

	Object.assign(checks, {
		attempted: 3,
		failed: 2,
		gradeDistribution: Object.fromEntries(
			[
				{ count: 2, grade: "A" },
				{ count: 1, grade: "F" },
			].map(({ grade, count }) => [grade, count]),
		),
		notReached: 1,
	});
	const reportText = `${JSON.stringify(report, null, RECORD_JSON_INDENT_SPACES)}\n`;

	parseComparisonReport(reportText);
	await Bun.write(reportFile, reportText);
}

async function rewriteFixtureAsLegacyPipeline(
	fixture: RecordedRunsFixture,
	version:
		| typeof LEGACY_COMPARISON_REPORT_VERSION
		| typeof JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
): Promise<void> {
	const { reportFile, report: current } = await pipelineFixture(fixture);

	const cases = current.cases.map(({ caseId, arms }) => ({
		arms: Object.fromEntries(
			COMPARISON_ARMS.map((role) => [
				role,
				{
					...arms[role],
					resources: armResourcesWithoutElapsed(arms[role].resources),
					source: legacyFixtureSource(arms[role].source),
				},
			]),
		),
		caseId,
	}));
	const contrasts = Object.fromEntries(
		Object.entries(current.contrasts).map(([pair, contrast]) => [
			pair,
			{
				...contrast,
				resources: contrastResourcesWithoutElapsed(contrast.resources),
			},
		]),
	);
	const legacy =
		version === JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION
			? { ...current, cases, contrasts, schemaVersion: 2 }
			: (() => {
					const { judgeAgreement: _judgeAgreement, ...fields } = current;

					return { ...fields, cases, contrasts, schemaVersion: 1 };
				})();
	const text = `${JSON.stringify(legacy, null, RECORD_JSON_INDENT_SPACES)}\n`;

	parseComparisonReport(text);
	await Bun.write(reportFile, text);
}

type PipelineReport = Extract<ComparisonReport, { mode: "pipeline" }>;

type PipelineSource =
	PipelineReport["cases"][number]["arms"]["baseline"]["source"];

type HistoricalRep = Omit<PipelineSource["reps"][number], "group" | "outcomes">;

interface HistoricalSource {
	readonly group: PipelineSource["groups"][number];
	readonly reps: readonly HistoricalRep[];
}

interface HistoricalSessionSource {
	readonly group: PipelineSource["groups"][number];
	readonly reps: readonly (HistoricalRep & {
		readonly attempt: NonNullable<HistoricalRep["attempt"]>;
	})[];
}

function legacyFixtureSource(source: PipelineSource): HistoricalSource {
	const group = singleGroupSource(source);
	return {
		group: group.group,
		reps: group.reps.map(({ outcomes: _outcomes, ...legacyRep }) => legacyRep),
	};
}

function sessionFixtureSource(source: PipelineSource): HistoricalSessionSource {
	const group = singleGroupSource(source);
	return {
		group: group.group,
		reps: group.reps.map((rep) => {
			const { outcomes: _outcomes, ...legacyRep } = rep;
			return Object.assign(legacyRep, {
				attempt: {
					path: `attempts/${rep.repId}.json`,
					sha256: "a".repeat(SHA256_HEX_DIGITS),
				},
			});
		}),
	};
}

type PipelineContrast =
	PipelineReport["contrasts"][keyof PipelineReport["contrasts"]];

type HistoricalContrast = Omit<PipelineContrast, "resources"> & {
	readonly resources: ReturnType<typeof contrastResourcesWithoutElapsed>;
};

function sessionFixtureContrasts(
	contrasts: PipelineReport["contrasts"],
): Readonly<Record<string, HistoricalContrast>> {
	return Object.fromEntries(
		Object.entries(contrasts).map(
			([pair, contrast]): readonly [string, HistoricalContrast] => {
				const quality = contrast.quality[FIRST_QUALITY_SUMMARY_INDEX];
				if (quality === undefined) {
					throw new Error("expected a comparison measure in the fixture");
				}

				return [
					pair,
					{
						...contrast,
						quality: [{ ...quality, name: "checks" }],
						resources: contrastResourcesWithoutElapsed(contrast.resources),
					},
				];
			},
		),
	);
}

async function pipelineFixture(
	fixture: RecordedRunsFixture,
): Promise<{ readonly reportFile: string; readonly report: PipelineReport }> {
	const { reportFile } = comparisonReportPaths(
		fixture.runsDirectory,
		fixture.comparisonDigest,
	);
	const report = parseComparisonReport(await Bun.file(reportFile).text());
	if (
		report.schemaVersion !== MULTIPLE_GROUP_COMPARISON_REPORT_VERSION ||
		report.mode !== "pipeline"
	) {
		throw new Error("expected the fixture to write a current pipeline report");
	}

	return { report, reportFile };
}

export {
	MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
	LEGACY_COMPARISON_REPORT_VERSION,
	JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	rewriteFixtureAsSession,
	leaveOneBaselineAttemptUnreached,
	rewriteFixtureAsLegacyPipeline,
};
