import { z } from "zod";

import type {
	EvidenceLocator,
	Immutable,
	RecordedStageEvidence,
} from "./contracts";
import { recordedStageEvidenceSchema, unhandled } from "./contracts";
import { parseRecord } from "./record-parse-cache";
import { table, usd } from "./record-summary-format";

const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;

const EXCHANGE_NUMBER_BASE = 1;

const INITIAL_CHARACTER_CODE_UNITS = 1;

const SINGLE_ITEM_COUNT = 1;

const DISPLAY_POSITION_BASE = 1;

const INITIAL_CHARACTER_INDEX = 0;

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const judgedItemSchema = z
	.object({
		evidence: z.array(recordedStageEvidenceSchema),
		grade: z.string().nonempty().optional(),
		id: z.string().nonempty(),
		status: z.string().nonempty().optional(),
	})
	.loose();

const recordedCostSchema = z.object({ costUsd: z.number() }).loose();

const summaryStageGradeSchema = z
	.object({
		dimensions: z.array(judgedItemSchema).optional(),
		grade: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		hardBlockers: z.array(judgedItemSchema).optional(),
		requirements: z.array(judgedItemSchema).optional(),
		verdict: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.loose();

const summaryScorecardSchema = z
	.object({
		costUsd: z.number(),
		grade: summaryStageGradeSchema,
		stage: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
	})
	.loose();

const runSummarySchema = z
	.object({
		caseId: z.string().nonempty(),
		failure: z.string().nonempty().optional(),
		grade: z
			.object({
				requirements: z.array(judgedItemSchema).optional(),
				summary: z.string().nonempty(),
				verdict: z.string().nonempty(),
			})
			.loose()
			.optional(),
		judgeCostUsd: z.number(),
		productOwnerCostUsd: z.number(),
		stageScorecards: z.array(summaryScorecardSchema),
		status: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		timestamp: z.string().min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		workflow: z.array(recordedCostSchema),
	})
	.loose();

type RunSummaryRecord = Immutable<z.infer<typeof runSummarySchema>>;

function parseRunSummaryRecord(text: string): RunSummaryRecord {
	return parseRecord(runSummarySchema, text);
}

function runSummary(runName: string, record: RunSummaryRecord): string {
	const stageCost = record.stageScorecards.reduce(
		(total, scorecard) => total + scorecard.costUsd,
		NO_SPEND_USD,
	);
	const workflowCost = record.workflow.reduce(
		(total, transcript) => total + transcript.costUsd,
		NO_SPEND_USD,
	);
	const totalCost =
		stageCost + workflowCost + record.productOwnerCostUsd + record.judgeCostUsd;

	return [
		`## run:${runName}`,
		"",
		`Case ${record.caseId}, status ${record.status}.`,
		"",
		...table(
			["stage", "grade", "verdict", "cost"],
			record.stageScorecards.map((scorecard) => [
				scorecard.stage,
				scorecard.grade.grade,
				scorecard.grade.verdict,
				usd(scorecard.costUsd),
			]),
		),
		"",
		`Final verdict ${record.grade?.verdict ?? record.failure ?? "none"}.`,
		`Total cost ${usd(totalCost)}.`,
		"",
		...record.stageScorecards.flatMap(({ stage, grade }) =>
			evidenceLines(stage, [
				...(grade.hardBlockers ?? []),
				...(grade.requirements ?? []),
				...(grade.dimensions ?? []),
			]),
		),
		...evidenceLines("final judge", record.grade?.requirements ?? []),
	].join("\n");
}

type JudgedItem = Immutable<z.infer<typeof judgedItemSchema>>;

function evidenceLines(judge: string, items: readonly JudgedItem[]): string[] {
	if (items.length === EMPTY_COLLECTION_LENGTH) {
		return [];
	}

	return [
		`### ${judge} evidence`,
		"",
		...items.flatMap((item) => {
			const result = `${item.id} ${item.status ?? item.grade ?? ""}`;

			return item.evidence.length === EMPTY_COLLECTION_LENGTH
				? [`- ${result}: no evidence.`]
				: item.evidence.map(
						(evidence) => `- ${result}: ${evidenceReading(evidence)}`,
					);
		}),
		"",
	];
}

function evidenceReading(evidence: RecordedStageEvidence): string {
	const cited = `${oneLine(evidence.claim)} (${evidence.source} ${evidence.path}).`;
	if (evidence.locator === undefined) {
		return `${cited} Recorded before quoted spans.`;
	}
	if (evidence.quote === undefined) {
		return `${cited} ${capitalized(locatorReading(evidence.locator))}.`;
	}

	return `${cited} Quote "${oneLine(evidence.quote)}" at ${locatorReading(evidence.locator)}.`;
}

function locatorReading(locator: EvidenceLocator): string {
	switch (locator.kind) {
		case "lines": {
			const lines =
				locator.startLine === locator.endLine
					? String(locator.startLine)
					: `${String(locator.startLine)}-${String(locator.endLine)}`;

			return `${locator.file}:${lines}${occurrences(locator.occurrences)}`;
		}
		case "hunk": {
			return `${locator.file} ${locator.hunk}${occurrences(locator.occurrences)}`;
		}
		case "commit-subject": {
			return `commit subject ${String(locator.index + DISPLAY_POSITION_BASE)}`;
		}
		case "exchange": {
			return `exchange ${String(locator.exchange + EXCHANGE_NUMBER_BASE)} ${locator.field}, characters ${String(locator.start)}-${String(locator.end)}`;
		}
		case "harness": {
			return locator.recorded
				? `harness result ${locator.result}`
				: `harness result ${locator.result}, which the stage input does not hold`;
		}
		case "absent": {
			return "a source the stage input does not hold";
		}
		default: {
			return unhandled(locator, "evidence locator");
		}
	}
}

function occurrences(count: number): string {
	return count === SINGLE_ITEM_COUNT ? "" : `, ${String(count)} occurrences`;
}

function oneLine(text: string): string {
	return text.replaceAll(/\s+/gu, " ").trim();
}

function capitalized(text: string): string {
	return `${text.charAt(INITIAL_CHARACTER_INDEX).toUpperCase()}${text.slice(INITIAL_CHARACTER_CODE_UNITS)}`;
}

export { runSummarySchema, parseRunSummaryRecord, runSummary, locatorReading };
export type { RunSummaryRecord };
export {
	groupReportSummarySchema,
	parseGroupReportSummaryRecord,
	groupSummary,
} from "./group-record-summary";
export { default as comparisonSummary } from "./comparison-record-summary";
export type {
	GroupReportSummaryRecord,
	RepReadsSummary,
} from "./group-record-summary";
