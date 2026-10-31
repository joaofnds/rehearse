import { randomUUID } from "node:crypto";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import concurrentMap from "./concurrent-map";
import { readdirIfPresent } from "./file-presence";
import type {
	AnalysisRecordWriter,
	AnalyzedRun,
	ClaimedAnalysis,
} from "./root-cause-analysis";
import readStoredAnalysis from "./root-cause-analysis-history";
import { analysisRecordJson } from "./root-cause-analysis-protocol";
import type {
	FailedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
import { rootCauseAnalysesDirectory, runNameFromTimestamp } from "./run-layout";

const CLAIM_RETRIES = 10;

const NO_RETRIES_LEFT = 0;

const RETRY_STEP = 1;

const CLAIM_STEP_MS = 1;

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

/**
 * Links the record into place from a whole temporary file, so a reader listing
 * the run's analyses never sees half a record and another analysis's record is
 * kept. A start in a millisecond another analysis of the run already holds is
 * moved to the next one, so each name still sorts in time order and names its
 * record's own start.
 */
async function claimAnalysis(
	runsDirectory: string,
	record: FailedAnalysis,
	retriesLeft = CLAIM_RETRIES,
): Promise<ClaimedAnalysis | undefined> {
	const file = analysisFile(runsDirectory, record);

	if (await linkedIntoPlace(file, record)) {
		return { file, record };
	}

	if (retriesLeft === NO_RETRIES_LEFT) {
		return undefined;
	}

	return await claimAnalysis(
		runsDirectory,
		{
			...record,
			startedAt: new Date(
				Date.parse(record.startedAt) + CLAIM_STEP_MS,
			).toISOString(),
		},
		retriesLeft - RETRY_STEP,
	);
}

/** False when another analysis already holds the name. */
async function linkedIntoPlace(
	file: string,
	record: FailedAnalysis,
): Promise<boolean> {
	await mkdir(dirname(file), { recursive: true });
	const temporary = temporaryFile(file);
	try {
		await writeRecord(temporary, record);
		await link(temporary, file);

		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "EEXIST") {
			return false;
		}

		throw error;
	} finally {
		await rm(temporary, { force: true });
	}
}

/** Renamed over the claimed file from a whole temporary one, so a reader sees one record or the other. */
async function replaceAnalysis(
	file: string,
	record: RootCauseAnalysisRecord,
): Promise<void> {
	const temporary = temporaryFile(file);
	try {
		await writeRecord(temporary, record);
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}
}

const analysisRecordFiles: AnalysisRecordWriter = {
	claim: async (runsDirectory, record) =>
		await claimAnalysis(runsDirectory, record),
	replace: replaceAnalysis,
};

function analysisFile(
	runsDirectory: string,
	record: RootCauseAnalysisRecord,
): string {
	return join(
		rootCauseAnalysesDirectory(runsDirectory),
		record.run,
		`${runNameFromTimestamp(record.startedAt)}.json`,
	);
}

function temporaryFile(file: string): string {
	return `${file}.${randomUUID()}.tmp`;
}

async function writeRecord(
	file: string,
	record: RootCauseAnalysisRecord,
): Promise<void> {
	await writeFile(file, `${analysisRecordJson(record)}\n`);
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

export { analysisRecordFiles, readRootCauseAnalyses };
export type { UnreadableAnalysis };
