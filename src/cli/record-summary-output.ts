import { parseComparisonReport } from "#benchmark/comparison-record";
import { displayPath } from "#benchmark/config";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import {
	comparisonSummary,
	groupSummary,
	parseGroupReportSummaryRecord,
	runSummary,
	runSummarySchema,
} from "#benchmark/record-summary";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { controlRelative } from "#cli/output";
import type { RecordId } from "#cli/record-id";

import groupRepReadsOf from "./group-read-evidence";

interface SummaryCorpusContext {
	readonly runsDirectory: string;
	readonly resolveCorpus: CorpusSourceResolver;
}

/**
 * A record whose kind has no summary prints its own bytes: the markdown exists
 * for the three records a session pastes onto a card, and inventing a summary
 * for a case declaration or a checkpoint would render less than the record it
 * replaced.
 */
async function summaryOf(
	id: RecordId,
	text: string,
	{ runsDirectory, resolveCorpus }: SummaryCorpusContext,
): Promise<string> {
	if (id.kind === "group") {
		return await groupSummaryOf({
			groupId: id.groupId,
			resolveCorpus,
			runsDirectory,
			text,
		});
	}
	if (id.kind === "run") {
		const record = runSummarySchema.safeParse(JSON.parse(text));

		return record.success ? runSummary(id.run, record.data) : text;
	}
	if (id.kind === "comparison") {
		return comparisonSummary(id.manifestDigest, parseComparisonReport(text));
	}

	return text;
}

/**
 * The reliability half of a group's summary lives in the report it writes
 * beside its record, so a group whose record reads but whose report does not
 * is a missing report, not a missing group: saying "No record group:<id>"
 * would deny a group that is there and that `--json` prints.
 */
interface GroupSummaryRequest extends SummaryCorpusContext {
	readonly groupId: string;
	readonly text: string;
}
async function groupSummaryOf({
	groupId,
	text,
	runsDirectory,
	resolveCorpus,
}: GroupSummaryRequest): Promise<string> {
	const { reportFile } = confirmationGroupPaths(runsDirectory, groupId);
	const file = Bun.file(reportFile);
	if (!(await file.exists())) {
		throw new RefusedPreconditionError(
			`No report for group:${groupId} at ${displayPath(reportFile)}; its record reads, so --json prints it`,
		);
	}

	const record = parseConfirmationGroupRecord(text);
	const { reads, judgedAgainst } = await groupRepReadsOf(
		runsDirectory,
		record,
		resolveCorpus,
	);

	return groupSummary(
		record,
		parseGroupReportSummaryRecord(await file.text()),
		{
			judgedAgainst,
			reads: { ...reads, reasons: reads.reasons.map(controlRelative) },
		},
	);
}

export { summaryOf as default };
