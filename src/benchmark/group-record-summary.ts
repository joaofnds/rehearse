import { z } from "zod";

import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import { SESSION_CONFIRMATION_SCHEMA_VERSION } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { corpusMeasurementReading } from "./corpus-version-label";
import { parseRecord } from "./record-parse-cache";
import { ratio, table, usd } from "./record-summary-format";
import type { GroupRepReads } from "./staleness-report";

const MINIMUM_GROUP_FIELD_LENGTH = 1;
const NO_GROUP_SPEND_USD = 0;
const NO_RECORDED_READS = 0;

const PREFIX_START_INDEX = 0;

const DIGEST_PREVIEW_CHARACTERS = 12;

const reliabilitySummarySchema = z
	.object({
		name: z.string().nonempty(),
		passK: z.number(),
		requested: z.number(),
		standardError: z.number(),
		successRate: z.number(),
		successful: z.number(),
	})
	.loose();

const summaryMissingCommandSchema = z.object({
	missing: z.array(z.string().min(MINIMUM_GROUP_FIELD_LENGTH)),
	status: z.literal("MISSING"),
});

const summaryTotalCostSchema = z
	.object({ costUsd: z.array(z.number()) })
	.loose();

const summaryCompleteCommandSchema = z.object({
	metrics: z.object({ costUsd: z.number() }).loose(),
	status: z.literal("COMPLETE"),
});

const summaryResourcesSchema = z
	.object({
		commandTotal: z
			.discriminatedUnion("status", [
				summaryCompleteCommandSchema,
				summaryMissingCommandSchema,
			])
			.optional(),
		total: summaryTotalCostSchema,
	})
	.loose();

const groupReportSummarySchema = z
	.object({
		reliability: z.array(reliabilitySummarySchema),
		resources: summaryResourcesSchema,
	})
	.loose();

type GroupReportSummaryRecord = Immutable<
	z.infer<typeof groupReportSummarySchema>
>;

function parseGroupReportSummaryRecord(text: string): GroupReportSummaryRecord {
	return parseRecord(groupReportSummarySchema, text);
}

function groupSummary(
	record: Immutable<ParsedConfirmationGroupRecord>,
	report: GroupReportSummaryRecord,
	reads: RepReadsSummary,
): string {
	const costs = report.resources.total.costUsd;
	const total = costs.reduce((sum, cost) => sum + cost, NO_GROUP_SPEND_USD);
	const { commandTotal } = report.resources;
	let costLine = `Cost ${usd(total)} over ${String(costs.length)} reps.`;
	if (
		record.schemaVersion === SESSION_CONFIRMATION_SCHEMA_VERSION &&
		record.mode === "session" &&
		commandTotal === undefined
	) {
		costLine = "Cost unavailable: command total evidence is missing.";
	} else if (commandTotal?.status === "MISSING") {
		costLine = `Cost unavailable: ${commandTotal.missing.join(", ")}.`;
	} else if (commandTotal?.status === "COMPLETE") {
		costLine = `Cost ${usd(commandTotal.metrics.costUsd)} for the confirmed command.`;
	}

	return [
		`## group:${record.groupId}`,
		"",
		`Case ${record.caseId}, ${record.mode} mode, ${String(record.reps)} reps.`,
		`Corpus ${corpusMeasurementReading(record.inputs.corpusVersion)}.`,
		"",
		...table(
			["outcome", "successful", "success rate", "standard error", "pass^k"],
			report.reliability.map((summary) => [
				summary.name,
				`${String(summary.successful)}/${String(summary.requested)}`,
				ratio(summary.successRate),
				ratio(summary.standardError),
				ratio(summary.passK),
			]),
		),
		"",
		costLine,
		"",
		...readLines(record.mode === "session", reads),
		"",
	].join("\n");
}

interface RepReadsSummary {
	readonly reads: GroupRepReads;
	readonly judgedAgainst: string | undefined;
}

function cell(text: string): string {
	return text.replaceAll(/\s+/gu, " ").replaceAll("|", String.raw`\|`);
}

function readLines(session: boolean, summary: RepReadsSummary): string[] {
	const { reps, reasons } = summary.reads;
	if (
		reps.length === NO_RECORDED_READS &&
		reasons.length === NO_RECORDED_READS
	) {
		return ["No rep recorded a read."];
	}

	const rows = reps.flatMap(({ repId, stage, readManifest }) =>
		readManifest.map((entry) => [
			repId,
			...(session ? [] : [stage ?? ""]),
			entry.path,
			entry.role,
			entry.evidence,
			entry.sha256?.slice(PREFIX_START_INDEX, DIGEST_PREVIEW_CHARACTERS) ??
				"none",
			entry.state ?? "not judged",
		]),
	);
	const judged = reps.some(({ readManifest }) =>
		readManifest.some(({ state }) => state !== undefined),
	);

	return [
		...(rows.length === NO_RECORDED_READS
			? []
			: table(
					[
						"rep",
						...(session ? [] : ["stage"]),
						"path",
						"role",
						"evidence",
						"sha256",
						"state",
					],
					rows.map((row) => row.map((text) => cell(text))),
				)),
		...(judged && summary.judgedAgainst !== undefined
			? [
					`States compare each file with ${summary.judgedAgainst} as it was when this summary was printed.`,
				]
			: []),
		...reasons.map((reason) => `${cell(reason)}.`),
	];
}

export {
	groupReportSummarySchema,
	parseGroupReportSummaryRecord,
	groupSummary,
};
export type { GroupReportSummaryRecord, RepReadsSummary };
