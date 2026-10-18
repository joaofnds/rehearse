import { withRecordReadScope } from "#benchmark/record-read-scope";
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
import { newestFirst } from "#benchmark/recorded-time";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	attemptStartedAt,
	parseSessionAttemptRecord,
} from "#benchmark/session-record";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { Immutable } from "#benchmark/contracts";
import type { CaseRun } from "./case-figures";
import { redactAbsolutePaths } from "./redact-path";
import { readRunRecord } from "./run-record";
import type { RunRecord } from "./run-record";
import { savedStateAssessment } from "./saved-state-assessment";

/** What a case's records say about it, its runs newest first. */
export interface RecordedCase {
	readonly runs: readonly CaseRun[];
	readonly members: readonly CaseRunMember[];
	/** The newest pipeline run's, and undefined for a case no pipeline run ran. */
	readonly minimumGrade: RunRecord["minimumGrade"] | undefined;
}

export interface CaseRunMember {
	readonly label: string;
	readonly href: string;
	readonly startedAt: string | null;
	readonly run: CaseRun;
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
	/** The run's name, or the start time its attempt or group recorded. */
	readonly time: string | undefined;
	readonly run: CaseRun;
	readonly label: string;
	readonly href: string;
	readonly minimumGrade?: RunRecord["minimumGrade"];
}

function digestOf(
	measurement: CorpusMeasurement | undefined,
): string | undefined {
	return measurement?.kind === "version" ? measurement.digest : undefined;
}

function unreadableRecord({
	id,
	reason,
}: UnreadableCaseRecord): UnreadableCaseRecord {
	return { id, reason: redactAbsolutePaths(reason) };
}

function pipelineRun(name: string, record: RunRecord): CaseRunOf {
	const {
		finalOutcome,
		totals: { cost },
	} = record;

	return {
		caseId: record.caseId,
		time: name,
		label: name,
		href: `/runs/${encodeURIComponent(name)}?view=results`,
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
		...sessionAssessment(record),
	};
}

function sessionAssessment(
	record: Immutable<SessionAttemptRecord>,
): Pick<CaseRun, "savedState" | "recordedOutcome" | "replyChecks"> {
	const checksRan =
		record.outcome === "SUCCESSFUL" || record.outcome === "UNSUCCESSFUL";
	const assessment = {
		recordedOutcome: record.outcome,
		savedState: savedStateAssessment(record),
	};
	if (checksRan) {
		return {
			...assessment,
			replyChecks: {
				passed: record.checks.filter(({ status }) => status === "PASS").length,
				total: record.checks.length,
			},
		};
	}
	return assessment;
}

async function repSessionAssessment(
	attemptFile: string,
): Promise<Pick<CaseRun, "savedState" | "recordedOutcome" | "replyChecks">> {
	try {
		const file = Bun.file(attemptFile);
		if (!(await file.exists())) {
			return {
				savedState: {
					state: "unavailable",
					reason: "The repetition has no saved session attempt.",
				},
			};
		}
		return sessionAssessment(parseSessionAttemptRecord(await file.text()));
	} catch (error) {
		return {
			savedState: {
				state: "unavailable",
				reason: `The repetition's saved session attempt could not be read: ${redactAbsolutePaths(error instanceof Error ? error.message : String(error))}`,
			},
		};
	}
}

/**
 * A pipeline rep passes on the final Judge's PASS and a session rep on the
 * outcome of an attempt whose checks ran. A rep record holds no successful
 * outcome without metrics, so a rep whose metrics went missing takes the
 * outcome its own attempt record kept, as a lone attempt would read.
 */
async function repPassed(
	rep: Immutable<ParsedConfirmationRepRecord>,
	attemptFile: string,
): Promise<boolean | undefined> {
	if (rep.mode === "pipeline") {
		return rep.finalOutcome.status === "JUDGED"
			? rep.finalOutcome.verdict === "PASS"
			: undefined;
	}

	const [checks] = rep.stages;
	if (checks?.status === "JUDGED") {
		return rep.outcome === "SUCCESSFUL";
	}

	if (checks?.status !== "METRICS_MISSING") {
		return undefined;
	}

	const attempt = Bun.file(attemptFile);
	if (!(await attempt.exists())) {
		return undefined;
	}

	return sessionAttemptRun(parseSessionAttemptRecord(await attempt.text()))
		.passed;
}

function repCost(
	rep: Immutable<ParsedConfirmationRepRecord>,
): number | undefined {
	return rep.metrics.status === "COMPLETE"
		? rep.metrics.calls.reduce(
				(total, { metrics }) => total + metrics.costUsd,
				0,
			)
		: undefined;
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
				pipelineRun(name, await readRunRecord(runsDirectory, name, liveness)),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(unreadableRecord({ id: name, reason: message }));
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
			const record = parseSessionAttemptRecord(await file.text());
			found.push({
				caseId: attempt.caseId,
				time: attemptStartedAt(record),
				label: `Session ${attempt.uuid.slice(0, 8)}`,
				href: `/attempts/session/${encodeURIComponent(attempt.caseId)}/${encodeURIComponent(attempt.uuid)}`,
				run: sessionAttemptRun(record),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(
				unreadableRecord({
					id: `${attempt.caseId}/${attempt.uuid}`,
					reason: message,
				}),
			);
		}
	}

	return { found, unreadable };
}

type RepReading =
	| { readonly state: "read"; readonly run: CaseRun }
	| { readonly state: "not-recorded" }
	| { readonly state: "unreadable"; readonly reason: string };

async function readRep(
	paths: Immutable<{ recordFile: string; attemptFile: string }>,
	corpusDigest: string | undefined,
): Promise<RepReading> {
	const file = Bun.file(paths.recordFile);
	if (!(await file.exists())) {
		return { state: "not-recorded" };
	}

	try {
		const rep = parseConfirmationRepRecord(await file.text());

		const run: CaseRun = {
			corpusDigest,
			passed: await repPassed(rep, paths.attemptFile),
			costUsd: repCost(rep),
		};
		if (rep.mode === "session") {
			return {
				state: "read",
				run: { ...run, ...(await repSessionAssessment(paths.attemptFile)) },
			};
		}
		return { state: "read", run };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);

		return { state: "unreadable", reason };
	}
}

/**
 * Pipeline and session groups' reps, each a run at its group's start time,
 * in group id order. A rep that recorded nothing readable still
 * counts, unjudged and uncosted, and a rep record that cannot be parsed is
 * reported besides. Stage-mode groups rerun one stage, not a case, so they
 * are left out.
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
				const reading = await readRep(paths.rep(repId), corpusDigest);
				if (reading.state === "unreadable") {
					unreadable.push(
						unreadableRecord({
							id: `${groupId}/${repId}`,
							reason: reading.reason,
						}),
					);
				}

				found.push({
					caseId: record.caseId,
					time: record.startedAt,
					label: `${groupId} · ${repId}`,
					href:
						record.mode === "session"
							? `/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(repId)}/attempt`
							: `/groups/${encodeURIComponent(groupId)}?view=attempts`,
					run:
						reading.state === "read"
							? reading.run
							: { corpusDigest, passed: undefined, costUsd: undefined },
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push(unreadableRecord({ id: groupId, reason: message }));
		}
	}

	return { found, unreadable };
}

/**
 * Every recorded run of every case, the runs a case's figures count, newest
 * first by its name or the start time its attempt or group recorded. A run
 * whose name names no instant follows, then attempts and groups written before
 * they recorded one, session attempts before group reps. Stage replays rerun
 * one stage of a run, not a case, so none is read.
 */
export function readCaseRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseRunsReading> {
	return withRecordReadScope(() => readScopedCaseRuns(runsDirectory, liveness));
}

async function readScopedCaseRuns(
	runsDirectory: string,
	liveness: RunLiveness,
): Promise<CaseRunsReading> {
	const readings = [
		await pipelineRuns(runsDirectory, liveness),
		await sessionAttempts(runsDirectory),
		await groupReps(runsDirectory),
	];
	const runs = newestFirst(
		readings.flatMap(({ found }) => found),
		({ time }) => time,
	);

	const cases = new Map<string, RecordedCase>();
	for (const [id, ofCase] of Map.groupBy(runs, ({ caseId }) => caseId)) {
		cases.set(id, {
			runs: ofCase.map(({ run }) => run),
			members: ofCase.map(({ run, label, href, time }) => ({
				run,
				label,
				href,
				startedAt: time ?? null,
			})),
			minimumGrade: ofCase.find(
				({ minimumGrade }) => minimumGrade !== undefined,
			)?.minimumGrade,
		});
	}

	return {
		cases,
		unreadable: readings.flatMap(({ unreadable }) => unreadable),
	};
}
