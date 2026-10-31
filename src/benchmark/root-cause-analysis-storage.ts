import { randomUUID } from "node:crypto";
import { link, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import concurrentMap from "./concurrent-map";
import { readdirIfPresent } from "./file-presence";
import orderedJson from "./ordered-json";
import type { AnalyzedRun } from "./root-cause-analysis";
import readStoredAnalysis from "./root-cause-analysis-history";
import { analysisRecordFieldOrder } from "./root-cause-analysis-protocol";
import type {
	FailedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
import { rootCauseAnalysesDirectory, runNameFromTimestamp } from "./run-layout";

const CLAIM_ATTEMPTS = 10;

const LAST_CLAIM_ATTEMPT = 1;

const CLAIM_ATTEMPT_STEP = 1;

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

/** Where an analysis's record lives, and how it is first put there and then replaced. */
interface AnalysisRecordWriter {
	readonly claim: (
		runsDirectory: string,
		record: FailedAnalysis,
	) => Promise<ClaimedAnalysis>;
	readonly replace: (
		file: string,
		record: RootCauseAnalysisRecord,
	) => Promise<void>;
}

interface ClaimedAnalysis {
	readonly file: string;
	readonly record: FailedAnalysis;
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
	attemptsLeft = CLAIM_ATTEMPTS,
): Promise<ClaimedAnalysis> {
	const file = analysisFile(runsDirectory, record);
	if (await linkedIntoPlace(file, record)) {
		return { file, record };
	}
	if (attemptsLeft === LAST_CLAIM_ATTEMPT) {
		throw new Error(
			`Other analyses of run ${record.run} hold every millisecond up to ${record.startedAt}, so this one was not started and spent nothing`,
		);
	}

	return await claimAnalysis(
		runsDirectory,
		{
			...record,
			startedAt: new Date(
				Date.parse(record.startedAt) + CLAIM_STEP_MS,
			).toISOString(),
		},
		attemptsLeft - CLAIM_ATTEMPT_STEP,
	);
}

/** False when another analysis already holds the name. */
async function linkedIntoPlace(
	file: string,
	record: FailedAnalysis,
): Promise<boolean> {
	await mkdir(dirname(file), { recursive: true });
	const temporary = await writeTemporary(file, record);
	try {
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
	const temporary = await writeTemporary(file, record);
	try {
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

async function writeTemporary(
	file: string,
	record: RootCauseAnalysisRecord,
): Promise<string> {
	const temporary = `${file}.${randomUUID()}.tmp`;
	const json = orderedJson({
		json: JSON.stringify(record),
		order: analysisRecordFieldOrder,
	});
	await writeFile(temporary, `${json}\n`);

	return temporary;
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
export type { AnalysisRecordWriter, ClaimedAnalysis, UnreadableAnalysis };
