import { parseRunSummaryRecord } from "./record-summary";
import { benchmarkRunPaths, recordedRunNames } from "./run-layout";

export interface DatedRecord {
	readonly record: { readonly kind: "run"; readonly run: string };
	readonly recordedAt: string;
}

export async function recordsOnDisk(
	runsDirectory: string,
	caseId: string,
): Promise<readonly DatedRecord[]> {
	const found: DatedRecord[] = [];

	for (const run of await recordedRunNames(runsDirectory)) {
		const { artifactFile } = benchmarkRunPaths(runsDirectory, run);
		const record = parseRunSummaryRecord(await Bun.file(artifactFile).text());
		if (record.caseId === caseId) {
			found.push({ record: { kind: "run", run }, recordedAt: run });
		}
	}

	return found.toSorted((left, right) =>
		left.recordedAt.localeCompare(right.recordedAt),
	);
}
