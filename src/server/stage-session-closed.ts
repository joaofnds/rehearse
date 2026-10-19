import { basename } from "node:path";

import { TRANSCRIPT_FILE } from "#benchmark/checkpoint";
import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import {
	checkpointsEntryForRun,
	stoppedSessionEntry,
} from "#benchmark/run-layout";
import {
	verifiedDirectoryWhenPresent,
	verifiedFile,
} from "#server/session-history-reader";
import { readStageRecord, verifiedStageOfRun } from "#server/stage-record";
import type {
	JudgedGrade,
	StageOfRun,
	StageRecord,
} from "#server/stage-record";
import JUDGED_SECTIONS from "#server/stage-session-contract";
import type {
	CitedSpan,
	StageSession,
	StageSessionRequest,
} from "#server/stage-session-contract";
import { lastLines } from "#server/stage-session-live";

const EXCHANGE_NUMBER_BASE = 1;

const NO_TRANSCRIPT_PREFIX_LINES = 0;

function spanPlace(
	evidence: Immutable<RecordedStageEvidence>,
): Pick<CitedSpan, "exchange" | "field"> {
	const { locator } = evidence;

	return locator?.kind === "exchange"
		? {
				exchange: locator.exchange + EXCHANGE_NUMBER_BASE,
				field: locator.field,
			}
		: {};
}

function citedSpans(grade: Immutable<JudgedGrade>): readonly CitedSpan[] {
	return JUDGED_SECTIONS.flatMap((section) =>
		grade[section].flatMap(({ id, evidence }) =>
			evidence.flatMap((cited, index): CitedSpan[] => {
				if (cited.source !== "transcript") {
					return [];
				}

				return [
					{
						claim: cited.claim,
						index,
						item: id,
						section,
						...(cited.quote !== undefined && { quote: cited.quote }),
						...spanPlace(cited),
					},
				];
			}),
		),
	);
}

/**
 * The stage's record is written once its session ends, whether the judge
 * then graded it, the run stopped on it, or the run died before the judge
 * finished, so its presence is what closes the session.
 */
async function closedStageSession(
	stageOfRun: StageOfRun,
	record: Immutable<Exclude<StageRecord, { state: "absent" }>>,
): Promise<Extract<StageSession, { state: "closed" }>> {
	const { runsRoot, run, stage } = stageOfRun;

	return {
		spans: record.state === "judged" ? citedSpans(record.grade) : [],
		state: "closed",
		...(await preservedTranscript(runsRoot, run, stage)),
	};
}

/**
 * The stage's transcript as its checkpoint preserved it, or as a stopped stage
 * kept it beside its stop record, named relative to the runs directory's
 * parent, or nothing when neither kept a copy.
 */
async function preservedTranscript(
	runsRoot: string,
	run: string,
	stage: string,
): Promise<{ lineCount: number; transcriptPath: string } | undefined> {
	const kept =
		(await keptTranscript(runsRoot, [checkpointsEntryForRun(run), stage])) ??
		(await keptTranscript(runsRoot, [stoppedSessionEntry(run, stage)]));
	if (kept === undefined) {
		return undefined;
	}

	const { lineCount } = await lastLines(
		runsRoot,
		kept.file,
		NO_TRANSCRIPT_PREFIX_LINES,
	);

	return {
		lineCount,
		transcriptPath: [basename(runsRoot), ...kept.entries, TRANSCRIPT_FILE].join(
			"/",
		),
	};
}

async function keptTranscript(
	runsRoot: string,
	entries: readonly string[],
): Promise<{ file: string; entries: readonly string[] } | undefined> {
	const directory = await verifiedDirectoryWhenPresent(runsRoot, entries);
	const file =
		directory === undefined
			? undefined
			: await verifiedFile(runsRoot, {
					directory,
					name: TRANSCRIPT_FILE,
					required: false,
				});

	return file === undefined ? undefined : { entries, file };
}

interface StageSessionReading {
	readonly stageOfRun: StageOfRun;
	readonly record: StageRecord;
}

async function stageSessionRecord(
	request: StageSessionRequest,
): Promise<StageSessionReading> {
	const stageOfRun = await verifiedStageOfRun(request);
	const record = await readStageRecord(stageOfRun);

	return { record, stageOfRun };
}

export { closedStageSession, stageSessionRecord };
