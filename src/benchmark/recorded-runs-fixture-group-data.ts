import type {
	ConfirmationGroupRecord,
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "./confirmation-record";
import { groupReportSummarySchema } from "./record-summary";
import type { GroupReportSummaryRecord } from "./record-summary";
import {
	CASE_ID,
	CORPUS_DIGEST,
	FIXTURE_PER_REP_MAXIMUM_USD,
	GIT_SHA1_HEX_DIGITS,
	GROUP_REP_FIXTURES,
	ORDINAL_BASE,
} from "./recorded-runs-fixture-readings";

type LegacyGroupRecord = Omit<ConfirmationGroupRecord, "caseId">;

interface SessionGroupRecordProps {
	readonly caseId: string;
	readonly groupId: string;
	readonly repIds: readonly string[];
	readonly preflightCostUsd: number | undefined;
}
interface SessionGroupRepRecordProps {
	readonly caseId: string;
	readonly groupId: string;
	readonly repId: string;
	readonly ordinal: number;
}

const GroupRecordData = {
	completePreflight(
		preflightCostUsd: number,
	): SessionConfirmationGroupRecord["preflight"] {
		return {
			call: {
				metrics: {
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					costUsd: preflightCostUsd,
					inputTokens: 0,
					outputTokens: 0,
					turns: 1,
				},
				role: "worker",
			},
			status: "COMPLETE",
		};
	},
	group(groupId: string): ConfirmationGroupRecord {
		return confirmationGroupRecordSchema.parse({
			...GroupRecordData.groupFieldsWithoutCaseId(groupId),
			caseId: CASE_ID,
		});
	},
	groupFieldsWithoutCaseId(groupId: string): LegacyGroupRecord {
		return {
			approval: { approved: true, method: "yes" },
			declaredStages: ["build"],
			groupId,
			inputs: {
				files: [
					{
						kind: "corpus",
						path: "inputs/corpus/build/SKILL.md",
						sha256: CORPUS_DIGEST,
					},
				],
				judgeModel: "opus",
				lineage: {
					kind: "CHECKPOINT",
					lineage: "lineage-build",
					targetSha: "2".repeat(GIT_SHA1_HEX_DIGITS),
				},
				model: "sonnet",
				pipelinePath: "cases/audit-log/pipelines/default.json",
				sessionBudgetUsd: 5,
			},
			makespanMs: 200,
			mode: "stage",
			projectedCost: {
				perRepMaximumUsd: FIXTURE_PER_REP_MAXIMUM_USD,
				reps: 2,
				totalMaximumUsd: 40,
			},
			repRecords: GROUP_REP_FIXTURES.map(({ ordinal }) => ({
				ordinal,
				path: `reps/${groupId}-rep-${ordinal}/rep.json`,
				repId: `${groupId}-rep-${ordinal}`,
			})),
			reportFile: "report.json",
			reps: 2,
			schemaVersion: 1,
		};
	},
	groupReport(): GroupReportSummaryRecord {
		return groupReportSummarySchema.parse({
			reliability: [
				{
					attempted: 2,
					failed: 1,
					name: "build",
					notReached: 0,
					passK: 0.25,
					requested: 2,
					standardError: 0.35355339059327373,
					successRate: 0.5,
					successful: 1,
				},
			],
			resources: {
				total: { costUsd: GROUP_REP_FIXTURES.map(({ costUsd }) => costUsd) },
			},
		});
	},
	sessionGroup(props: SessionGroupRecordProps): SessionConfirmationGroupRecord {
		return sessionConfirmationGroupRecordSchema.parse({
			approval: { approved: true, method: "yes" },
			caseId: props.caseId,
			declaredStages: ["checks"],
			groupId: props.groupId,
			inputs: {
				files: [
					{ kind: "case", path: "inputs/case.json", sha256: CORPUS_DIGEST },
				],
				lineage: { kind: "SESSION", lineage: "session-lineage" },
				model: "sonnet",
				sessionBudgetUsd: 1,
			},
			makespanMs: 1,
			mode: "session",
			preflight:
				props.preflightCostUsd === undefined
					? { missing: "metrics unavailable", status: "MISSING" }
					: GroupRecordData.completePreflight(props.preflightCostUsd),
			projectedCost: {
				perRepMaximumUsd: 1,
				preflightMaximumUsd: 0,
				reps: 2,
				totalMaximumUsd: 2,
			},
			repRecords: props.repIds.map((repId, index) => ({
				ordinal: index + ORDINAL_BASE,
				path: `reps/${repId}/rep.json`,
				repId,
			})),
			reportFile: "report.json",
			reps: 2,
			schemaVersion: 2,
		});
	},
	sessionRep(props: SessionGroupRepRecordProps): SessionConfirmationRepRecord {
		return sessionConfirmationRepRecordSchema.parse({
			caseId: props.caseId,
			elapsedMs: 1,
			finalOutcome: { status: "NOT_APPLICABLE" },
			groupId: props.groupId,
			lineage: { kind: "SESSION", lineage: "session-lineage" },
			metrics: { calls: [], missing: ["metrics"], status: "MISSING" },
			mode: "session",
			ordinal: props.ordinal,
			outcome: "UNSUCCESSFUL",
			repId: props.repId,
			schemaVersion: 2,
			stages: [
				{
					evidence: { recordFile: "attempt.json" },
					reason: "not reached",
					stage: "checks",
					status: "NOT_REACHED",
				},
			],
			workerTrajectorySteps: 0,
		});
	},
};

export { GroupRecordData as default };
