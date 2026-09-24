import { unhandled } from "./contracts";
import { z } from "zod";
import { CaseDeclarationError, casesRoot, readCaseDeclaration } from "./case";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import { loadRunManifest } from "./manifest";
import { parseRunSummaryRecord } from "./record-summary";
import { readReplayRecord } from "./replay-record";
import { openRunEventStore } from "./run-events";
import type { RunEventStore } from "./run-events";
import type { ConfirmationRepPaths } from "./run-layout";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
	replayAttemptIds,
	replayRecordFile,
	runEventsDatabaseFile,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "./run-layout";
import { stoppedStage } from "./run-outcome";
import { parseSessionAttemptRecord } from "./session-record";
import type { NamedRecord } from "./short-id";

/**
 * A record the backfill numbers, with the time its own identity or transcript
 * says it ran, or undefined when neither says.
 */
export interface DatedRecord {
	readonly record: NamedRecord;
	readonly recordedAt: string | undefined;
}

/**
 * Run history reads every one of these, so a record it shows has a number and
 * one it reports unreadable does not. A reading that throws is that report.
 */
async function readable<Read>(
	read: () => Promise<Read>,
): Promise<Read | undefined> {
	try {
		return await read();
	} catch {
		return undefined;
	}
}

async function manifestCaseId(manifestFile: string): Promise<string> {
	const manifest = await loadRunManifest(manifestFile);

	return manifest.caseId;
}

/**
 * A run's case as run history reads it: from its artifact, else from its
 * manifest when a stop record or an event says it ran. A run whose latest
 * event is not terminal is numbered too, since reconciliation marks it
 * interrupted, and run history then lists it.
 */
async function runCaseId(
	runsDirectory: string,
	run: string,
	events: Pick<RunEventStore, "latestEvent">,
): Promise<string | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await Bun.file(paths.artifactFile).exists()) {
		const record = parseRunSummaryRecord(
			await Bun.file(paths.artifactFile).text(),
		);

		return record.caseId;
	}

	const stopped = await stoppedStage(runsDirectory, run);
	if (stopped === undefined && events.latestEvent(run) === undefined) {
		return undefined;
	}

	return manifestCaseId(paths.manifestFile);
}

const timestampedLineSchema = z.object({ timestamp: z.string().min(1) });
const excludedPrefixSchema = z.object({
	transcriptDiagnostics: z
		.object({ prefixLinesExcluded: z.number().int().nonnegative() })
		.optional(),
});

/**
 * The prefix line count an attempt stored with its transcript, or undefined
 * for a record written before attempts stored it.
 */
function storedPrefixLines(attemptText: string): number | undefined {
	let contents: unknown;
	try {
		contents = JSON.parse(attemptText);
	} catch {
		return undefined;
	}

	return excludedPrefixSchema.safeParse(contents).data?.transcriptDiagnostics
		?.prefixLinesExcluded;
}

/**
 * The lines a case's starting transcript puts ahead of a session's own, which
 * is the count the harness stores when it records an attempt. A record written
 * before attempts stored it is dated after this many lines, and a case that
 * declares no starting transcript, or no longer exists, puts none.
 */
async function declaredPrefixLines(
	caseId: string,
	casesDirectory: string,
): Promise<number> {
	try {
		const declaration = await readCaseDeclaration(caseId, casesDirectory);

		return declaration.kind === "session"
			? (declaration.transcript?.cut ?? 0)
			: 0;
	} catch (error) {
		if (error instanceof CaseDeclarationError) {
			return 0;
		}

		throw error;
	}
}

/**
 * The first time a transcript recorded after the lines a prior session left
 * in it, in the run-name spelling so it sorts beside run names as text.
 */
async function firstTranscriptTime(
	transcriptFile: string,
	prefixLines = 0,
): Promise<string | undefined> {
	const text = await Bun.file(transcriptFile)
		.text()
		.catch(() => "");
	for (const line of text.split("\n").slice(prefixLines)) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		const timestamp = timestampedLineSchema.safeParse(parsed).data?.timestamp;
		if (timestamp !== undefined) {
			return timestamp.replaceAll(":", "-");
		}
	}

	return undefined;
}

function earliest(times: readonly (string | undefined)[]): string | undefined {
	return times
		.filter((time) => time !== undefined)
		.toSorted((left, right) => left.localeCompare(right))
		.at(0);
}

/**
 * A runs directory no run has written an event into yet. Opening the store
 * there would create its database, a write that concurrent first claims
 * contend for, to answer a question whose answer is already known.
 */
const NO_EVENTS: Pick<RunEventStore, "latestEvent" | "close"> = {
	latestEvent: () => undefined,
	close: () => undefined,
};

async function runs(
	runsDirectory: string,
	caseId: string,
): Promise<DatedRecord[]> {
	const databaseFile = runEventsDatabaseFile(runsDirectory);
	const events = (await Bun.file(databaseFile).exists())
		? await openRunEventStore(databaseFile)
		: NO_EVENTS;
	try {
		const found: DatedRecord[] = [];
		for (const run of await recordedRunNames(runsDirectory)) {
			const recordCase = await readable(() =>
				runCaseId(runsDirectory, run, events),
			);
			if (recordCase === caseId) {
				found.push({ record: { kind: "run", run }, recordedAt: run });
			}
		}

		return found;
	} finally {
		events.close();
	}
}

async function sessionAttempts(
	runsDirectory: string,
	caseId: string,
	declaredPrefix: number,
): Promise<DatedRecord[]> {
	const found: DatedRecord[] = [];
	for (const attempt of await sessionAttemptIds(runsDirectory)) {
		if (attempt.caseId !== caseId) {
			continue;
		}
		const paths = sessionAttemptPaths(runsDirectory, attempt);
		const text = await readable(async () => {
			const recordText = await Bun.file(paths.recordFile).text();
			parseSessionAttemptRecord(recordText);

			return recordText;
		});
		if (text === undefined) {
			continue;
		}

		found.push({
			record: { kind: "attempt:session", ...attempt },
			recordedAt: await firstTranscriptTime(
				paths.transcriptFile,
				storedPrefixLines(text) ?? declaredPrefix,
			),
		});
	}

	return found;
}

async function replays(
	runsDirectory: string,
	caseId: string,
): Promise<DatedRecord[]> {
	const found: DatedRecord[] = [];
	for (const attempt of await replayAttemptIds(runsDirectory)) {
		const recordCase = await readable(async () => {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, attempt.lineage, attempt.timestamp),
			);

			return manifestCaseId(
				benchmarkRunPaths(runsDirectory, record.runName).manifestFile,
			);
		});
		if (recordCase === caseId) {
			found.push({
				record: { kind: "attempt:stage", ...attempt },
				recordedAt: attempt.timestamp,
			});
		}
	}

	return found;
}

async function repTime(
	paths: ConfirmationRepPaths,
	declaredPrefix: number,
): Promise<string | undefined> {
	const attempt = Bun.file(paths.attemptFile);
	const stored = (await attempt.exists())
		? storedPrefixLines(await attempt.text())
		: undefined;

	return firstTranscriptTime(paths.transcriptFile, stored ?? declaredPrefix);
}

async function groups(
	runsDirectory: string,
	caseId: string,
	declaredPrefix: number,
): Promise<DatedRecord[]> {
	const found: DatedRecord[] = [];
	for (const groupId of await confirmationGroupIds(runsDirectory)) {
		const paths = confirmationGroupPaths(runsDirectory, groupId);
		const record = await readable(async () =>
			parseConfirmationGroupRecord(await Bun.file(paths.groupFile).text()),
		);
		if (record?.caseId !== caseId) {
			continue;
		}

		const repTimes = await Promise.all(
			record.repRecords.map(({ repId }) =>
				repTime(paths.rep(repId), declaredPrefix),
			),
		);
		found.push({
			record: { kind: "group", groupId },
			recordedAt: earliest(repTimes),
		});
	}

	return found;
}

const KIND_ORDER: readonly NamedRecord["kind"][] = [
	"run",
	"attempt:stage",
	"attempt:session",
	"group",
];

function identity(record: NamedRecord): string {
	switch (record.kind) {
		case "run": {
			return record.run;
		}
		case "attempt:stage": {
			return `${record.lineage}/${record.timestamp}`;
		}
		case "attempt:session": {
			return `${record.caseId}/${record.uuid}`;
		}
		case "group": {
			return record.groupId;
		}
		default: {
			return unhandled(record, "short id record kind");
		}
	}
}

/**
 * Oldest first by the time each record says it ran. Records that say nothing
 * come after every timed one, since placing them by file time would claim an
 * order the records never held, and among themselves by kind, then identifier.
 */
function oldestFirst(left: DatedRecord, right: DatedRecord): number {
	if (left.recordedAt !== right.recordedAt) {
		if (left.recordedAt === undefined) {
			return 1;
		}
		if (right.recordedAt === undefined) {
			return -1;
		}

		return left.recordedAt.localeCompare(right.recordedAt);
	}

	return (
		KIND_ORDER.indexOf(left.record.kind) -
			KIND_ORDER.indexOf(right.record.kind) ||
		identity(left.record).localeCompare(identity(right.record))
	);
}

/**
 * Every readable record of a case already on disk, in the order the backfill
 * numbers them. A record run history cannot read, or one whose case nothing
 * names, is left out, and a run the event store alone knows has no directory
 * of its own to be listed from.
 */
export async function recordsOnDisk(
	runsDirectory: string,
	caseId: string,
	casesDirectory: string = casesRoot(),
): Promise<readonly DatedRecord[]> {
	const declaredPrefix = await declaredPrefixLines(caseId, casesDirectory);
	const found = [
		...(await runs(runsDirectory, caseId)),
		...(await sessionAttempts(runsDirectory, caseId, declaredPrefix)),
		...(await replays(runsDirectory, caseId)),
		...(await groups(runsDirectory, caseId, declaredPrefix)),
	];

	return found.toSorted(oldestFirst);
}
