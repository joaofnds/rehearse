import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import {
	benchmarkRunPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import type { RunLiveness } from "#benchmark/run-liveness";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { Immutable } from "#benchmark/contracts";
import type { CaseRun } from "./case-figures";
import { redactAbsolutePaths } from "./redact-path";
import { readRunRecord } from "./run-record";
import type { RunRecord } from "./run-record";

/** What a case's records say about it, its runs newest first. */
export interface RecordedCase {
	readonly runs: readonly CaseRun[];
	/** The newest pipeline run's, and undefined for a case no pipeline run ran. */
	readonly minimumGrade: RunRecord["minimumGrade"] | undefined;
}

export interface UnreadableCaseRecord {
	readonly id: string;
	readonly reason: string;
}

export interface CaseRunsReading {
	readonly cases: ReadonlyMap<string, RecordedCase>;
	readonly unreadable: readonly UnreadableCaseRecord[];
}

interface Found {
	readonly found: readonly CaseRunOf[];
	readonly unreadable: readonly UnreadableCaseRecord[];
}

interface CaseRunOf {
	readonly caseId: string;
	readonly run: CaseRun;
	readonly minimumGrade?: RunRecord["minimumGrade"];
}

function digestOf(
	measurement: CorpusMeasurement | undefined,
): string | undefined {
	return measurement?.kind === "version" ? measurement.digest : undefined;
}

function unreadableRecord(id: string, message: string): UnreadableCaseRecord {
	return { id, reason: redactAbsolutePaths(message) };
}

function pipelineRun(record: RunRecord): CaseRunOf {
	const {
		finalOutcome,
		totals: { cost },
	} = record;

	return {
		caseId: record.caseId,
		run: {
			corpusDigest: digestOf(record.identity.corpusVersion),
			passed:
				finalOutcome.status === "JUDGED"
					? finalOutcome.verdict === "PASS"
					: undefined,
			costUsd:
				cost.state === "available" && cost.missing.length === 0
					? cost.usd
					: undefined,
		},
		minimumGrade: record.minimumGrade,
	};
}

/** Checks ran for a reply that came back, and for nothing else. */
function sessionAttemptRun(record: Immutable<SessionAttemptRecord>): CaseRun {
	return {
		corpusDigest: digestOf(record.corpusVersion),
		passed:
			record.outcome === "SUCCESSFUL" || record.outcome === "UNSUCCESSFUL"
				? record.outcome === "SUCCESSFUL"
				: undefined,
		costUsd: record.metrics?.costUsd,
	};
}

/**
 * A pipeline rep passes on the final Judge's PASS and a session rep on its
 * checks passing. A rep whose metrics are missing lacks its whole cost.
 */
function repPassed(
	rep: Immutable<ParsedConfirmationRepRecord>,
): boolean | undefined {
	if (rep.mode === "session") {
		const [checks] = rep.stages;

		return checks?.status === "JUDGED"
			? checks.verdict === "CONTINUE" && checks.grade === "A"
			: undefined;
	}

	return rep.finalOutcome.status === "JUDGED"
		? rep.finalOutcome.verdict === "PASS"
		: undefined;
}

function repRun(
	rep: Immutable<ParsedConfirmationRepRecord> | undefined,
	corpusDigest: string | undefined,
): CaseRun {
	if (rep === undefined) {
		return { corpusDigest, passed: undefined, costUsd: undefined };
	}

	return {
		corpusDigest,
		passed: repPassed(rep),
		costUsd:
			rep.metrics.status === "COMPLETE"
				? rep.metrics.calls.reduce(
						(total, { metrics }) => total + metrics.costUsd,
						0,
					)
				: undefined,
	};
}

async function pipelineRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	const recorded = await recordedRunNames(runsDirectory);
	const names = recorded.toSorted((left, right) => right.localeCompare(left));
	for (const name of names) {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (!(await Bun.file(manifestFile).exists())) {
			continue;
		}

		try {
			found.push(
				pipelineRun(await readRunRecord(runsDirectory, name, liveness)),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(unreadableRecord(name, message));
		}
	}

	return { found, unreadable };
}

async function sessionAttempts(runsDirectory: string): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	for (const attempt of await sessionAttemptIds(runsDirectory)) {
		const file = Bun.file(
			sessionAttemptPaths(runsDirectory, attempt).recordFile,
		);
		if (!(await file.exists())) {
			continue;
		}

		try {
			found.push({
				caseId: attempt.caseId,
				run: sessionAttemptRun(parseSessionAttemptRecord(await file.text())),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(
				unreadableRecord(`${attempt.caseId}/${attempt.uuid}`, message),
			);
		}
	}

	return { found, unreadable };
}

async function readRep(
	file: string,
): Promise<ParsedConfirmationRepRecord | undefined> {
	try {
		return parseConfirmationRepRecord(await Bun.file(file).text());
	} catch {
		return undefined;
	}
}

/**
 * Pipeline and session groups' reps, each a run, in group id order since
 * group records carry no time. A rep that recorded nothing readable still
 * counts, unjudged and uncosted. Stage-mode groups rerun one stage, not a
 * case, so they are left out.
 */
async function groupReps(runsDirectory: string): Promise<Found> {
	const found: CaseRunOf[] = [];
	const unreadable: UnreadableCaseRecord[] = [];
	const recorded = await confirmationGroupIds(runsDirectory);
	const groupIds = recorded.toSorted((left, right) =>
		left.localeCompare(right),
	);
	for (const groupId of groupIds) {
		const paths = confirmationGroupPaths(runsDirectory, groupId);
		const file = Bun.file(paths.groupFile);
		if (!(await file.exists())) {
			continue;
		}

		try {
			const record = parseConfirmationGroupRecord(await file.text());
			if (record.mode === "stage") {
				continue;
			}

			const corpusDigest = digestOf(record.inputs.corpusVersion);
			for (const { repId } of record.repRecords) {
				found.push({
					caseId: record.caseId,
					run: repRun(await readRep(paths.rep(repId).recordFile), corpusDigest),
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(unreadableRecord(groupId, message));
		}
	}

	return { found, unreadable };
}

/**
 * Every recorded run of every case, the runs a case's figures count:
 * pipeline runs newest first, then session attempts, then group reps.
 * Stage replays rerun one stage of a run, not a case, so none is read.
 */
export async function readCaseRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseRunsReading> {
	const readings = [
		await pipelineRuns(runsDirectory, liveness),
		await sessionAttempts(runsDirectory),
		await groupReps(runsDirectory),
	];
	const runs = readings.flatMap(({ found }) => found);

	const cases = new Map<string, RecordedCase>();
	for (const [id, ofCase] of Map.groupBy(runs, ({ caseId }) => caseId)) {
		cases.set(id, {
			runs: ofCase.map(({ run }) => run),
			minimumGrade: ofCase.find(({ minimumGrade }) => minimumGrade)
				?.minimumGrade,
		});
	}

	return {
		cases,
		unreadable: readings.flatMap(({ unreadable }) => unreadable),
	};
}
