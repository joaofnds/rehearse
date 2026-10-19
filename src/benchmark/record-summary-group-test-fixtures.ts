import {
	confirmationGroupRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import type {
	GroupReportSummaryRecord,
	RepReadsSummary,
} from "./record-summary";
import { parseGroupReportSummaryRecord } from "./record-summary";

const RECORDED_LIGHT_REP_COST_USD = 1.25;
const RECORDED_HEAVY_REP_COST_USD = 2.75;

const GIT_SHA1_HEX_DIGITS = 40;
const SHA256_HEX_DIGITS = 64;
const GROUP_RECORD = confirmationGroupRecordSchema.parse({
	approval: { approved: true, method: "yes" },
	caseId: "audit-log",
	declaredStages: ["build"],
	groupId: "group-1",
	inputs: {
		files: [
			{
				kind: "corpus",
				path: "inputs/corpus/build/SKILL.md",
				sha256: "a".repeat(SHA256_HEX_DIGITS),
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
	projectedCost: { perRepMaximumUsd: 20, reps: 2, totalMaximumUsd: 40 },
	repRecords: [{ ordinal: 1 }, { ordinal: 2 }].map(({ ordinal }) => ({
		ordinal,
		path: `reps/group-1-rep-${ordinal}/rep.json`,
		repId: `group-1-rep-${ordinal}`,
	})),
	reportFile: "report.json",
	reps: 2,
	schemaVersion: 1,
});

const GROUP_REPORT: GroupReportSummaryRecord = parseGroupReportSummaryRecord(
	JSON.stringify({
		reliability: [
			{
				name: "build",
				passK: 0.25,
				requested: 2,
				standardError: 0.35355339059327373,
				successRate: 0.5,
				successful: 1,
			},
		],
		resources: {
			total: {
				costUsd: [RECORDED_LIGHT_REP_COST_USD, RECORDED_HEAVY_REP_COST_USD],
			},
		},
	}),
);

const NO_READS: RepReadsSummary = {
	judgedAgainst: "the live install",
	reads: { reasons: [], reps: [] },
};

const SESSION_GROUP_RECORD = parseConfirmationGroupRecord(
	JSON.stringify({
		approval: { approved: true, method: "yes" },
		caseId: "smoke",
		declaredStages: ["checks"],
		groupId: "session-group",
		inputs: {
			files: [
				{
					kind: "case",
					path: "inputs/case.json",
					sha256: "a".repeat(SHA256_HEX_DIGITS),
				},
			],
			lineage: { kind: "SESSION", lineage: "lineage-1" },
			model: "sonnet",
			sessionBudgetUsd: 0.2,
		},
		makespanMs: 100,
		mode: "session",
		preflight: { missing: "preflight call metrics", status: "MISSING" },
		projectedCost: {
			perRepMaximumUsd: 0.2,
			preflightMaximumUsd: 0.1,
			reps: 2,
			totalMaximumUsd: 0.5,
		},
		repRecords: [{ ordinal: 1 }, { ordinal: 2 }].map(({ ordinal }) => ({
			ordinal,
			path: `reps/session-group-rep-${ordinal}/rep.json`,
			repId: `session-group-rep-${ordinal}`,
		})),
		reportFile: "report.json",
		reps: 2,
		schemaVersion: 2,
	}),
);

export { GROUP_RECORD, GROUP_REPORT, NO_READS, SESSION_GROUP_RECORD };
