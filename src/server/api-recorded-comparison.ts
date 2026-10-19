import { parseComparisonReport } from "#benchmark/comparison-record";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { displayPath } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { parseRecordId } from "#cli/record-id";
import { recordFileFor } from "#cli/show-command";

async function recordedComparison(
	digest: string,
	runsDirectory: string,
): Promise<{
	readonly file: string;
	readonly report: ComparisonReport | LegacyComparisonReport;
}> {
	const file = await recordFileFor(
		parseRecordId(`comparison:${digest}`),
		runsDirectory,
	);
	if (!(await Bun.file(file).exists())) {
		throw new RefusedPreconditionError(
			`No record comparison:${digest} at ${displayPath(file)}`,
		);
	}

	return { file, report: parseComparisonReport(await Bun.file(file).text()) };
}

export { recordedComparison as default };
