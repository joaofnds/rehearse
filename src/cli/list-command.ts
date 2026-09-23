import { readdir } from "node:fs/promises";
import { listCases } from "#benchmark/case";
import { CONTROL_DIR } from "#benchmark/config";
import { parseCheckpointRecord } from "#benchmark/checkpoint";
import { unhandled } from "#benchmark/contracts";
import { parseComparisonReport } from "#benchmark/comparison-record";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { loadRunManifest } from "#benchmark/manifest";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { readReplayRecord } from "#benchmark/replay";
import { stoppedStage } from "#benchmark/run-outcome";
import { stoppedStatus } from "#benchmark/stopped-status";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	comparisonDigests,
	comparisonReportPaths,
	confirmationGroupIds,
	confirmationGroupPaths,
	recordedRunNames,
	replayAttemptIds,
	replayRecordFile,
	sessionAttemptIds,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { UsageError } from "#cli/commands";
import type { CommandOutput, UnreadableRecord } from "#cli/output";
import { writeUnreadable } from "#cli/output";
import type { RecordId } from "#cli/record-id";
import { formatRecordId } from "#cli/record-id";

export const LIST_KINDS = [
	"cases",
	"runs",
	"checkpoints",
	"attempts",
	"groups",
	"comparisons",
] as const;

export type ListKind = (typeof LIST_KINDS)[number];

export interface ListedRecord {
	readonly id: string;
	readonly fields: readonly string[];
}

export interface RecordListing {
	readonly entries: readonly ListedRecord[];
	readonly unreadable: readonly UnreadableRecord[];
}

function parseListKind(kind: string | undefined): ListKind {
	const found = LIST_KINDS.find((candidate) => candidate === kind);
	if (found === undefined) {
		throw new UsageError(
			`List kind ${kind ?? "(none)"} is not one of ${LIST_KINDS.join(", ")}`,
		);
	}

	return found;
}

/**
 * One unreadable record must not hide the valid ones: a half-written group or
 * an attempt directory whose run died before it wrote anything is reported by
 * id and reason while every record that parses still prints. This is the
 * `case list` precedent, and it is why each listing collects rather than
 * throws.
 */
async function collect<Named>(
	named: readonly Named[],
	idOf: (name: Named) => RecordId,
	read: (name: Named) => Promise<readonly string[]>,
): Promise<RecordListing> {
	const entries: ListedRecord[] = [];
	const unreadable: UnreadableRecord[] = [];

	for (const name of named) {
		const id = formatRecordId(idOf(name));
		try {
			entries.push({ id, fields: await read(name) });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			unreadable.push({ id, reason: controlRelative(message) });
		}
	}

	return { entries, unreadable };
}

/**
 * A reason is printed for a person, and the README tells a session to paste it
 * onto a card others read: a filesystem error names an absolute path, and
 * under the control root that discloses the home directory while naming the
 * same file the control-relative path names.
 */
export function controlRelative(reason: string): string {
	return reason.replaceAll(`${CONTROL_DIR}/`, "");
}

async function listDeclaredCases(): Promise<RecordListing> {
	const listing = await listCases();

	return {
		entries: listing.declarations.map((declaration) => ({
			id: formatRecordId({ kind: "case", caseId: declaration.id }),
			fields: [declaration.title],
		})),
		unreadable: listing.unreadable.map(({ id, reason }) => ({
			id: formatRecordId({ kind: "case", caseId: id }),
			reason,
		})),
	};
}

/**
 * A run that stopped at a stage never writes an artifact, and stopping is a
 * normal outcome the pipeline takes whenever a judge grades below the
 * minimum, not a failure to report as unreadable: the stage it stopped at,
 * read from the stop record that stage's file holds, replaces the artifact's
 * status. A run that also has no stop record and no artifact died before any
 * stage finished; it gets a plain line saying so rather than a raw ENOENT. A
 * stopped run whose manifest was never written is reported unreadable rather
 * than replayable.
 */
async function listRuns(runsDirectory: string): Promise<RecordListing> {
	const names = await recordedRunNames(runsDirectory);

	return collect(
		names,
		(run) => ({ kind: "run", run }),
		async (run) => {
			const paths = benchmarkRunPaths(runsDirectory, run);
			if (await Bun.file(paths.artifactFile).exists()) {
				const record = parseRunSummaryRecord(
					await Bun.file(paths.artifactFile).text(),
				);
				const replayable = await Bun.file(paths.manifestFile).exists();

				return [
					record.caseId,
					record.status,
					replayable ? "replayable" : "not replayable",
				];
			}

			const stopped = await stoppedStage(runsDirectory, run);
			if (stopped === undefined) {
				return ["no record"];
			}

			const { caseId } = await loadRunManifest(paths.manifestFile).catch(
				(): never => {
					throw new Error(
						`incomplete: no manifest.json at ${paths.manifestFile}`,
					);
				},
			);

			return [caseId, stoppedStatus(stopped.stage), "replayable"];
		},
	);
}

export interface RunCheckpoint {
	readonly run: string;
	readonly stage: string;
}

export async function recordedCheckpoints(
	runsDirectory: string,
): Promise<readonly RunCheckpoint[]> {
	const checkpoints: RunCheckpoint[] = [];

	for (const run of await recordedRunNames(runsDirectory)) {
		const paths = benchmarkRunPaths(runsDirectory, run);
		const stages = await stageDirectories(paths.checkpointsDirectory);
		checkpoints.push(...stages.map((stage) => ({ run, stage })));
	}

	return checkpoints;
}

async function stageDirectories(
	checkpointsDirectory: string,
): Promise<readonly string[]> {
	const entries = await readdir(checkpointsDirectory, {
		withFileTypes: true,
	}).catch(() => []);

	return entries
		.filter((entry) => entry.isDirectory())
		.map(({ name }) => name)
		.toSorted((left, right) => (left < right ? -1 : 1));
}

async function listCheckpoints(runsDirectory: string): Promise<RecordListing> {
	const checkpoints = await recordedCheckpoints(runsDirectory);

	return collect(
		checkpoints,
		({ run, stage }) => ({ kind: "checkpoint", run, stage }),
		async ({ run, stage }) => {
			const paths = benchmarkRunPaths(runsDirectory, run);
			const recordFile = checkpointRecordFile(paths.checkpointDirectory(stage));
			if (!(await Bun.file(recordFile).exists())) {
				throw new Error("incomplete: no checkpoint.json recorded");
			}

			const record = parseCheckpointRecord(await Bun.file(recordFile).text());

			return [record.stage, record.lineage];
		},
	);
}

async function listGroups(runsDirectory: string): Promise<RecordListing> {
	const groupIds = await confirmationGroupIds(runsDirectory);

	return collect(
		groupIds,
		(groupId) => ({ kind: "group", groupId }),
		async (groupId) => {
			const paths = confirmationGroupPaths(runsDirectory, groupId);
			const record = parseConfirmationGroupRecord(
				await Bun.file(paths.groupFile).text(),
			);

			return [record.caseId, record.mode, `${String(record.reps)} reps`];
		},
	);
}

async function listComparisons(runsDirectory: string): Promise<RecordListing> {
	const digests = await comparisonDigests(runsDirectory);

	return collect(
		digests,
		(manifestDigest) => ({ kind: "comparison", manifestDigest }),
		async (manifestDigest) => {
			const paths = comparisonReportPaths(runsDirectory, manifestDigest);
			const report = parseComparisonReport(
				await Bun.file(paths.reportFile).text(),
			);

			return [
				`${String(report.cases.length)} ${report.cases.length === 1 ? "case" : "cases"}`,
				`${String(report.reps)} reps`,
			];
		},
	);
}

/**
 * Both kinds the glossary's Attempt entry names: one session of a session case,
 * and one stage replayed from a checkpoint. They are one listing because a
 * session choosing what to re-run wants every prior measurement, and the id's
 * kind is what keeps the two apart.
 */
async function listAttempts(runsDirectory: string): Promise<RecordListing> {
	const sessions = await collect(
		await sessionAttemptIds(runsDirectory),
		({ caseId, uuid }) => ({ kind: "attempt:session", caseId, uuid }),
		async (attempt) => {
			const { recordFile } = sessionAttemptPaths(runsDirectory, attempt);
			if (!(await Bun.file(recordFile).exists())) {
				throw new Error("incomplete: no attempt.json recorded");
			}

			const record = parseSessionAttemptRecord(
				await Bun.file(recordFile).text(),
			);

			return [record.caseId, record.outcome, record.model];
		},
	);
	const replays = await collect(
		await replayAttemptIds(runsDirectory),
		({ lineage, timestamp }) => ({ kind: "attempt:stage", lineage, timestamp }),
		async ({ lineage, timestamp }) => {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, lineage, timestamp),
			);

			return [
				record.stage,
				`${record.scorecard.grade.grade} ${record.scorecard.grade.verdict}`,
				record.model,
			];
		},
	);

	return {
		entries: [...sessions.entries, ...replays.entries],
		unreadable: [...sessions.unreadable, ...replays.unreadable],
	};
}

export function listRecords(
	kind: ListKind,
	runsDirectory: string,
): Promise<RecordListing> {
	switch (kind) {
		case "cases": {
			return listDeclaredCases();
		}
		case "runs": {
			return listRuns(runsDirectory);
		}
		case "checkpoints": {
			return listCheckpoints(runsDirectory);
		}
		case "attempts": {
			return listAttempts(runsDirectory);
		}
		case "groups": {
			return listGroups(runsDirectory);
		}
		case "comparisons": {
			return listComparisons(runsDirectory);
		}
		default: {
			return unhandled(kind, "list kind");
		}
	}
}

export interface ListRequest {
	readonly kind: string | undefined;
	readonly runsDirectory: string;
}

export async function runList(
	request: ListRequest,
	output: CommandOutput,
): Promise<void> {
	const listing = await listRecords(
		parseListKind(request.kind),
		request.runsDirectory,
	);

	writeUnreadable(output, listing.unreadable);
	for (const { id, fields } of listing.entries) {
		output.stdout(`${[id, ...fields].join("\t")}\n`);
	}
}
