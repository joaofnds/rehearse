import { relative } from "node:path";

import type { ConfirmationGroupFinalization } from "./confirmation-group-finalization-contract";
import type {
	ConfirmationGroupRecord,
	SessionConfirmationGroupRecord,
} from "./confirmation-record";
import {
	parseConfirmationRepRecord,
	writableConfirmationGroupRecordSchema,
	writableSessionConfirmationGroupRecordSchema,
} from "./confirmation-record";
import {
	buildReliabilityReport,
	buildResourceReport,
	buildSessionCommandTotal,
} from "./confirmation-report";
import type { Immutable } from "./contracts";
import {
	filterJudgeAgreementReport,
	loadJudgeAgreementReport,
} from "./judge-agreement";
import type { SessionQualityReading } from "./session-quality-reading";

const ORDINAL_BASE = 1;

const PREFIX_START_INDEX = 0;

async function readGroupRepRecords(
	repRecordFiles: readonly string[],
): Promise<readonly FinalizationRepRecord[]> {
	return await Promise.all(
		repRecordFiles.map(async (path) =>
			parseConfirmationRepRecord(await Bun.file(path).text()),
		),
	);
}

function groupReliability(
	finalization: Immutable<ConfirmationGroupFinalization>,
	records: readonly FinalizationRepRecord[],
): ReturnType<typeof buildReliabilityReport> {
	const reliabilityInputs = records.map((record) => {
		if (finalization.mode === "stage" || finalization.mode === "session") {
			return {
				finalOutcome: { status: "NOT_REACHED" as const },
				metricsComplete: record.metrics.status === "COMPLETE",
				stages: record.stages,
			};
		}
		if (record.finalOutcome.status === "NOT_APPLICABLE") {
			throw new Error(
				"Pipeline rep cannot have a not-applicable final outcome",
			);
		}

		return {
			finalOutcome: record.finalOutcome,
			metricsComplete: record.metrics.status === "COMPLETE",
			stages: record.stages,
		};
	});
	return buildReliabilityReport(finalization.declaredStages, reliabilityInputs);
}

async function groupReport(
	finalization: Immutable<ConfirmationGroupFinalization>,
	records: readonly FinalizationRepRecord[],
	reliability: ReturnType<typeof buildReliabilityReport>,
): Promise<FinalizedGroupReport> {
	const sessionResources = groupSessionResources(finalization, records);
	const commonReport = {
		reliability:
			finalization.mode === "stage" || finalization.mode === "session"
				? reliability.slice(
						PREFIX_START_INDEX,
						finalization.declaredStages.length,
					)
				: reliability,
		resources: sessionResources,
	};
	if (
		finalization.mode === "session" &&
		records.some((record) => "judge" in record && record.judge !== undefined)
	) {
		return {
			...commonReport,
			judges: records.flatMap((record) =>
				"judge" in record && record.judge !== undefined
					? [{ repId: record.repId, ...record.judge }]
					: [],
			),
			outcomeMeaning: "reply/transcript checks only",
		};
	}

	const report =
		finalization.mode === "session"
			? commonReport
			: {
					...commonReport,
					judgeAgreement: filterJudgeAgreementReport(
						await loadJudgeAgreementReport(finalization.runsDirectory),
						[finalization.inputs.judgeModel],
					),
				};

	return report;
}

function groupRecord(
	finalization: Immutable<ConfirmationGroupFinalization>,
	repRecordFiles: readonly string[],
): ConfirmationGroupRecord | SessionConfirmationGroupRecord {
	const sharedGroup = {
		approval: { approved: true, method: finalization.approvalMethod },
		caseId: finalization.caseId,
		declaredStages: finalization.declaredStages,
		groupId: finalization.groupId,
		inputs: finalization.inputs,
		makespanMs: finalization.makespanMs,
		projectedCost: finalization.projectedCost,
		repRecords: repRecordFiles.map((path, index) => ({
			ordinal: index + ORDINAL_BASE,
			path: relative(finalization.groupDirectory, path),
			repId: `${finalization.groupId}-rep-${index + ORDINAL_BASE}`,
		})),
		reportFile: relative(finalization.groupDirectory, finalization.reportFile),
		reps: finalization.reps,
		startedAt: finalization.startedAt,
	};
	const group =
		finalization.mode === "session"
			? writableSessionConfirmationGroupRecordSchema.parse({
					mode: "session",
					preflight: finalization.preflight,
					schemaVersion: 2,
					...sharedGroup,
				})
			: writableConfirmationGroupRecordSchema.parse({
					mode: finalization.mode,
					schemaVersion: 1,
					...sharedGroup,
				});

	return group;
}

type FinalizationRepRecord = ReturnType<typeof parseConfirmationRepRecord>;

interface FinalizedGroupReport {
	readonly outcomeMeaning?: string | undefined;
	readonly judges?:
		| readonly ({ readonly repId: string } & SessionQualityReading)[]
		| undefined;
	readonly reliability: ReturnType<typeof buildReliabilityReport>;
	readonly resources: ReturnType<typeof buildResourceReport> & {
		readonly commandTotal?: ReturnType<typeof buildSessionCommandTotal>;
	};
	readonly judgeAgreement?: Awaited<
		ReturnType<typeof loadJudgeAgreementReport>
	>;
}

function groupSessionResources(
	finalization: Immutable<ConfirmationGroupFinalization>,
	records: readonly FinalizationRepRecord[],
): FinalizedGroupReport["resources"] {
	const resources = buildResourceReport(
		finalization.declaredStages,
		records,
		finalization.makespanMs,
	);
	const sessionResources =
		finalization.mode === "session"
			? {
					...resources,
					commandTotal: buildSessionCommandTotal(
						resources,
						finalization.preflight.status === "COMPLETE"
							? {
									metrics: finalization.preflight.call.metrics,
									status: "COMPLETE",
								}
							: {
									missing: finalization.preflight.missing,
									status: "MISSING",
								},
					),
				}
			: resources;

	return sessionResources;
}

export { readGroupRepRecords, groupReliability, groupReport, groupRecord };

export type { FinalizedGroupReport };
