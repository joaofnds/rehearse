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
import type { ShortIdEntry } from "#benchmark/short-id";
import { checkpointShortId, shortIdsOf } from "#cli/short-id-column";
import { redactAbsolutePaths } from "./redact-path";
import type { Reading } from "./run-record";
import { readRecordedEvidenceFile } from "./session-history-reader";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;
type ReportCase = AnyComparisonReport["cases"][number];
type ArmSource = ReportCase["arms"][ComparisonArm]["source"];

export type ArmCorpusVersion = Reading<{ readonly digest: string }>;

/** The checkpoint every arm replayed, with its short id once its run holds one. */
export type ComparedCheckpoint = Checkpoint & { readonly shortId?: string };

/** Where a comparison's arms came from, which its report does not carry. */
export interface ComparisonProvenance {
	readonly checkpoint: Reading<ComparedCheckpoint>;
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

/** A record that cannot be read costs its arm a header fact, never the page. */
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
		const message =
			error instanceof Error
				? redactAbsolutePaths(error.message)
				: String(error);

		return {
			state: "unavailable",
			reasons: [`a group record could not be read: ${message}`],
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

async function readCaseClaims(
	runsDirectory: string,
	caseId: string,
): Promise<Reading<{ readonly claims: readonly ShortIdEntry[] }>> {
	try {
		return {
			state: "available",
			claims: await readShortIds(runsDirectory, caseId),
		};
	} catch (error) {
		const message =
			error instanceof Error
				? redactAbsolutePaths(error.message)
				: String(error);

		return {
			state: "unavailable",
			reasons: [`the short ids of ${caseId} could not be read: ${message}`],
		};
	}
}

function checkpointKey(checkpoint: Checkpoint): string {
	return `${checkpoint.stage} ${checkpoint.run}`;
}

async function comparedCheckpoint(
	runsDirectory: string,
	report: AnyComparisonReport,
	cases: readonly CaseGroups[],
): Promise<Reading<ComparedCheckpoint>> {
	if (report.mode !== "stage") {
		return {
			state: "unavailable",
			reasons: [`a ${report.mode} comparison replays no single checkpoint`],
		};
	}

	const checkpoints = new Map<string, Checkpoint>();
	const claimed: ShortIdEntry[] = [];
	const reasons: string[] = [];
	for (const { caseId, arms } of cases) {
		const registry = await readCaseClaims(runsDirectory, caseId);
		if (registry.state === "unavailable") {
			reasons.push(...registry.reasons);
			continue;
		}
		const { claims } = registry;
		claimed.push(...claims);
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

	if (reasons.length > 0) {
		return { state: "unavailable", reasons };
	}
	const [only, ...others] = [...checkpoints.values()];
	if (only === undefined || others.length > 0) {
		return {
			state: "unavailable",
			reasons: [`the arms replayed ${String(checkpoints.size)} checkpoints`],
		};
	}

	const shortId = await checkpointShortId(
		runsDirectory,
		shortIdsOf(claimed),
		only.run,
		only.stage,
	);

	return shortId === undefined
		? { state: "available", ...only }
		: { state: "available", ...only, shortId };
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
	if (
		first?.kind === "version" &&
		measurements.every(
			(measurement) =>
				measurement?.kind === "version" && measurement.digest === first.digest,
		)
	) {
		return { state: "available", digest: first.digest };
	}
	const readings = [
		...new Set(
			measurements.map((measurement) => corpusMeasurementReading(measurement)),
		),
	];

	return {
		state: "unavailable",
		reasons:
			readings.length === 1
				? readings
				: [`the arm's groups ran ${readings.join(", ")}`],
	};
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
