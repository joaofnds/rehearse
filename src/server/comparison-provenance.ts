import { ZodError } from "zod";
import type { Checkpoint } from "#benchmark/compare-attempts";
import { COMPARISON_ARMS } from "#benchmark/comparison-record";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import { corpusMeasurementReading } from "#benchmark/corpus-version-label";
import { claimedReplaySource, readShortIds } from "#benchmark/short-id";
import type { Reading } from "./run-record";
import {
	readRecordedEvidenceFile,
	SessionHistoryReaderError,
} from "./session-history-reader";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;
type ReportCase = AnyComparisonReport["cases"][number];
type ArmSource = ReportCase["arms"][ComparisonArm]["source"];

export type ArmCorpusVersion = Reading<{ readonly digest: string }>;

/** Where a comparison's arms came from, which its report does not carry. */
export interface ComparisonProvenance {
	readonly checkpoint: Reading<Checkpoint>;
	readonly corpusVersions: Readonly<
		Record<string, Readonly<Record<ComparisonArm, ArmCorpusVersion>>>
	>;
}

interface RecordedGroup {
	readonly groupId: string;
	readonly corpusVersion: CorpusMeasurement | undefined;
}

type ArmGroups = Reading<{ readonly groups: readonly RecordedGroup[] }>;

interface CaseGroups {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ArmGroups>>;
}

function groupPaths(source: ArmSource): readonly string[] {
	return "group" in source
		? [source.group.path]
		: source.groups.map(({ path }) => path);
}

async function readArmGroups(
	runsDirectory: string,
	source: ArmSource,
): Promise<ArmGroups> {
	try {
		const groups = await Promise.all(
			groupPaths(source).map(async (path): Promise<RecordedGroup> => {
				const file = await readRecordedEvidenceFile(runsDirectory, path);
				const group = parseConfirmationGroupRecord(file.text);

				return {
					groupId: group.groupId,
					corpusVersion: group.inputs.corpusVersion,
				};
			}),
		);

		return { state: "available", groups };
	} catch (error) {
		if (
			!(error instanceof SessionHistoryReaderError) &&
			!(error instanceof ZodError) &&
			!(error instanceof SyntaxError)
		) {
			throw error;
		}

		return {
			state: "unavailable",
			reasons: [`a group record could not be read: ${error.message}`],
		};
	}
}

async function readCaseGroups(
	runsDirectory: string,
	benchmarkCase: ReportCase,
): Promise<CaseGroups> {
	const read = (arm: ComparisonArm): Promise<ArmGroups> =>
		readArmGroups(runsDirectory, benchmarkCase.arms[arm].source);

	return {
		caseId: benchmarkCase.caseId,
		arms: {
			baseline: await read("baseline"),
			candidate: await read("candidate"),
			control: await read("control"),
		},
	};
}

function checkpointKey(checkpoint: Checkpoint): string {
	return `${checkpoint.stage} ${checkpoint.run}`;
}

async function comparedCheckpoint(
	runsDirectory: string,
	report: AnyComparisonReport,
	cases: readonly CaseGroups[],
): Promise<Reading<Checkpoint>> {
	if (report.mode !== "stage") {
		return {
			state: "unavailable",
			reasons: [`a ${report.mode} comparison replays no single checkpoint`],
		};
	}

	const checkpoints = new Map<string, Checkpoint>();
	const reasons: string[] = [];
	for (const { caseId, arms } of cases) {
		const claims = await readShortIds(runsDirectory, caseId);
		for (const arm of COMPARISON_ARMS) {
			const groups = arms[arm];
			if (groups.state === "unavailable") {
				reasons.push(...groups.reasons);
				continue;
			}
			for (const group of groups.groups) {
				const source = claimedReplaySource(claims, group.groupId);
				if (source === undefined) {
					reasons.push(
						`group ${group.groupId} records no checkpoint it replayed`,
					);
					continue;
				}
				checkpoints.set(checkpointKey(source), {
					run: source.run,
					stage: source.stage,
				});
			}
		}
	}

	const [only, ...others] = [...checkpoints.values()];
	if (reasons.length > 0) {
		return { state: "unavailable", reasons };
	}
	if (only === undefined || others.length > 0) {
		return {
			state: "unavailable",
			reasons: [`the arms replayed ${String(checkpoints.size)} checkpoints`],
		};
	}

	return { state: "available", ...only };
}

/**
 * An arm reads as one version only when every group it holds ran that
 * version, so an arm extended on another corpus shows each reading instead.
 */
function armCorpusVersion(armGroups: ArmGroups): ArmCorpusVersion {
	if (armGroups.state === "unavailable") {
		return armGroups;
	}

	const measurements = armGroups.groups.map(
		({ corpusVersion }) => corpusVersion,
	);
	const [first] = measurements;
	const readings = [
		...new Set(
			measurements.map((measurement) => corpusMeasurementReading(measurement)),
		),
	];

	return first?.kind === "version" && readings.length === 1
		? { state: "available", digest: first.digest }
		: { state: "unavailable", reasons: readings };
}

export async function comparisonProvenance(
	report: AnyComparisonReport,
	runsDirectory: string,
): Promise<ComparisonProvenance> {
	const cases = await Promise.all(
		report.cases.map((benchmarkCase) =>
			readCaseGroups(runsDirectory, benchmarkCase),
		),
	);

	return {
		checkpoint: await comparedCheckpoint(runsDirectory, report, cases),
		corpusVersions: Object.fromEntries(
			cases.map(({ caseId, arms }) => [
				caseId,
				{
					baseline: armCorpusVersion(arms.baseline),
					candidate: armCorpusVersion(arms.candidate),
					control: armCorpusVersion(arms.control),
				},
			]),
		),
	};
}
