import { randomUUID } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import concurrentMap from "./concurrent-map";
import { readdirIfPresent } from "./file-presence";
import orderedJson from "./ordered-json";
import type { AnalysisResult, AnalyzedRun } from "./root-cause-analysis";
import readStoredAnalysis from "./root-cause-analysis-history";
import { analysisRecordFieldOrder } from "./root-cause-analysis-protocol";
import type { RootCauseAnalysisRecord } from "./root-cause-analysis-protocol";
import { rootCauseAnalysesDirectory, runNameFromTimestamp } from "./run-layout";

interface UnreadableAnalysis {
	readonly file: string;
	readonly reason: string;
}

async function readRootCauseAnalyses({
	runsDirectory,
	run,
}: AnalyzedRun): Promise<{
	readonly records: readonly RootCauseAnalysisRecord[];
	readonly unreadable: readonly UnreadableAnalysis[];
}> {
	const directory = join(rootCauseAnalysesDirectory(runsDirectory), run);
	const names = (await readdirIfPresent(directory)) ?? [];

	const readings = await concurrentMap(
		names.filter((name) => name.endsWith(".json")).toSorted(),
		async (file) => await readAnalysisFile(directory, file),
	);
	const records: RootCauseAnalysisRecord[] = [];
	const unreadable: UnreadableAnalysis[] = [];
	for (const reading of readings) {
		if (reading.record === undefined) {
			unreadable.push(reading.failure);
		} else {
			records.push(reading.record);
		}
	}

	return { records, unreadable };
}

async function writeAnalysis(
	runsDirectory: string,
	record: RootCauseAnalysisRecord,
): Promise<AnalysisResult> {
	const file = join(
		rootCauseAnalysesDirectory(runsDirectory),
		record.run,
		`${runNameFromTimestamp(record.startedAt)}.json`,
	);
	await mkdir(dirname(file), { recursive: true });
	// Linked into place from a whole temporary file, so a reader listing the
	// run's analyses never sees half a record, and an existing one is kept.
	const temporary = `${file}.${randomUUID()}.tmp`;
	const json = orderedJson({
		json: JSON.stringify(record),
		order: analysisRecordFieldOrder,
	});
	await writeFile(temporary, `${json}\n`);
	try {
		await link(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}

	return { file, record };
}

async function readAnalysisFile(
	directory: string,
	file: string,
): Promise<
	| { readonly record: RootCauseAnalysisRecord; readonly failure?: never }
	| { readonly failure: UnreadableAnalysis; readonly record?: never }
> {
	try {
		return {
			record: await readStoredAnalysis(join(directory, file)),
		};
	} catch (error) {
		return {
			failure: {
				file,
				reason: error instanceof Error ? error.message : String(error),
			},
		};
	}
}

export { readRootCauseAnalyses, writeAnalysis };
export type { UnreadableAnalysis };
