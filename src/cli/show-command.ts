import { caseDeclarationPath, casesRoot } from "#benchmark/case";
import { parseComparisonReport } from "#benchmark/comparison-record";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { displayPath } from "#benchmark/config";
import { unhandled } from "#benchmark/contracts";
import {
	comparisonSummary,
	groupSummary,
	parseGroupReportSummaryRecord,
	runSummary,
	runSummarySchema,
} from "#benchmark/record-summary";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	comparisonReportPaths,
	confirmationGroupPaths,
	replayRecordFile,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import { stoppedStage } from "#benchmark/run-outcome";
import { checkpointStageAt, resolveShortId } from "#benchmark/short-id";
import { exists } from "node:fs/promises";
import { z } from "zod";
import { addWorktree, refExists } from "#benchmark/target";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import type { RecordId, RunRecordId, ShortIdReference } from "#cli/record-id";
import { frozenStages } from "#cli/short-id-column";
import {
	parseRecordId,
	parseRecordReference,
	parseRunRecordId,
	recordIdForms,
} from "#cli/record-id";

/**
 * A run that stopped at a stage never writes an artifact, so its id resolves
 * to the stopped stage's own file instead: that file is the record that
 * exists on disk, and printing it is what tells `show` from a run that simply
 * has no record at all, which resolves to nothing here and is refused by
 * `recordText` the same way an absent artifact always was.
 */
async function runRecordFile(
	id: { readonly run: string },
	runsDirectory: string,
): Promise<string | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, id.run);
	if (await Bun.file(paths.artifactFile).exists()) {
		return paths.artifactFile;
	}

	const stopped = await stoppedStage(runsDirectory, id.run);

	return stopped === undefined ? undefined : paths.stageFile(stopped.stage);
}

export async function recordFileFor(
	id: RecordId,
	runsDirectory: string,
): Promise<string> {
	switch (id.kind) {
		case "case": {
			return caseDeclarationPath(id.caseId, casesRoot());
		}
		case "run": {
			return (
				(await runRecordFile(id, runsDirectory)) ??
				benchmarkRunPaths(runsDirectory, id.run).artifactFile
			);
		}
		case "checkpoint": {
			const paths = benchmarkRunPaths(runsDirectory, id.run);

			return checkpointRecordFile(paths.checkpointDirectory(id.stage));
		}
		case "attempt:session": {
			return sessionAttemptPaths(runsDirectory, id).recordFile;
		}
		case "attempt:stage": {
			return replayRecordFile(runsDirectory, id.lineage, id.timestamp);
		}
		case "group": {
			return confirmationGroupPaths(runsDirectory, id.groupId).groupFile;
		}
		case "comparison": {
			return comparisonReportPaths(runsDirectory, id.manifestDigest).reportFile;
		}
		default: {
			return unhandled(id, "record id kind");
		}
	}
}

/**
 * A well-formed id naming no record is a precondition the command refuses, not
 * a malformed command line: the same distinction `case show` already draws.
 * The path is named the way a session can paste it onto a card, which is what
 * the README tells one to do with this output.
 */
async function recordText(id: string, file: string): Promise<string> {
	const record = Bun.file(file);
	if (!(await record.exists())) {
		throw new RefusedPreconditionError(
			`No record ${id} at ${displayPath(file)}`,
		);
	}

	return record.text();
}

/**
 * A record whose kind has no summary prints its own bytes: the markdown exists
 * for the three records a session pastes onto a card, and inventing a summary
 * for a case declaration or a checkpoint would render less than the record it
 * replaced.
 */
async function summaryOf(
	id: RecordId,
	text: string,
	runsDirectory: string,
): Promise<string> {
	if (id.kind === "group") {
		const summary = await groupSummaryOf(id.groupId, text, runsDirectory);

		return summary;
	}
	if (id.kind === "run") {
		const record = runSummarySchema.safeParse(JSON.parse(text));

		return record.success ? runSummary(id.run, record.data) : text;
	}
	if (id.kind === "comparison") {
		return comparisonSummary(id.manifestDigest, parseComparisonReport(text));
	}

	return text;
}

/**
 * The reliability half of a group's summary lives in the report it writes
 * beside its record, so a group whose record reads but whose report does not
 * is a missing report, not a missing group: saying "No record group:<id>"
 * would deny a group that is there and that `--json` prints.
 */
async function groupSummaryOf(
	groupId: string,
	text: string,
	runsDirectory: string,
): Promise<string> {
	const { reportFile } = confirmationGroupPaths(runsDirectory, groupId);
	const file = Bun.file(reportFile);
	if (!(await file.exists())) {
		throw new RefusedPreconditionError(
			`No report for group:${groupId} at ${displayPath(reportFile)}; its record reads, so --json prints it`,
		);
	}

	return groupSummary(
		parseConfirmationGroupRecord(text),
		parseGroupReportSummaryRecord(await file.text()),
	);
}

/**
 * The Record ID a short id names, read from the registry and, for a
 * checkpoint, from the stages the run froze into its manifest. A short id that
 * names nothing is refused the way a Record ID naming no file is.
 */
async function resolvedShortId(
	given: string,
	reference: ShortIdReference,
	runsDirectory: string,
): Promise<RecordId> {
	const record = await resolveShortId(runsDirectory, {
		caseId: reference.caseId,
		kind: reference.shortKind,
		number: reference.number,
	});
	if (record === undefined) {
		throw new RefusedPreconditionError(`No record holds short id ${given}`);
	}
	if (reference.stage === undefined) {
		return record;
	}

	const stage =
		record.kind === "run"
			? checkpointStageAt(
					await frozenStages(runsDirectory, record.run),
					reference.stage,
				)
			: undefined;
	if (stage === undefined || record.kind !== "run") {
		throw new RefusedPreconditionError(
			`No checkpoint holds short id ${given}: its run has no stage ${String(reference.stage)}`,
		);
	}

	return { kind: "checkpoint", run: record.run, stage };
}

function recordIdFor(given: string, runsDirectory: string): Promise<RecordId> {
	const reference = parseRecordReference(given);

	return reference.kind === "short"
		? resolvedShortId(given, reference, runsDirectory)
		: Promise.resolve(reference);
}

export interface ShowRequest {
	readonly id: string | undefined;
	readonly json: boolean;
	readonly runsDirectory: string;
	readonly checkout?: string | undefined;
}

export async function runShow(
	request: ShowRequest,
	output: CommandOutput,
): Promise<void> {
	if (request.id === undefined) {
		throw new UsageError(
			`Provide the record id: rehearse show <${recordIdForms().join(" | ")}>`,
		);
	}
	if (request.checkout !== undefined) {
		output.stdout(
			`${await checkoutRetainedCandidate(request.id, request.checkout, request.runsDirectory)}\n`,
		);

		return;
	}

	const id = await recordIdFor(request.id, request.runsDirectory);
	const text = await recordText(
		request.id,
		await recordFileFor(id, request.runsDirectory),
	);

	output.stdout(
		request.json ? text : await summaryOf(id, text, request.runsDirectory),
	);
}

const retainedRunSchema = z.object({ sourceRoot: z.string().min(1) }).loose();

/**
 * The run recorded which repository it ran in and which commit it produced, so
 * `--checkout` takes no target of its own: a second answer could disagree with
 * the first. The worktree is of the retention ref rather than of the sha,
 * because the ref is what keeps that commit reachable once the target was
 * restored.
 */
async function checkoutRetainedCandidate(
	given: string,
	directory: string,
	runsDirectory: string,
): Promise<string> {
	const id = parseCheckoutRunId(given);
	const { artifactFile } = benchmarkRunPaths(runsDirectory, id.run);
	const text = await recordText(given, artifactFile);
	const { sourceRoot } = retainedRunSchema.parse(JSON.parse(text));
	const reference = `refs/rehearse/${id.run}`;
	await refuseExistingDirectory(directory);
	await refuseUnretainedRun(sourceRoot, reference, id.run);
	await addWorktree(sourceRoot, reference, directory);

	return directory;
}

/**
 * `--checkout` names one thing to materialize, and only a run retains a
 * candidate. A prefixed id of another kind is refused by name, so the caller
 * is told which id to give rather than failing later on a missing ref.
 */
function parseCheckoutRunId(given: string): RunRecordId {
	const parsed = given.includes(":")
		? parseRecordId(given)
		: parseRunRecordId(given);
	if (parsed.kind !== "run") {
		throw new UsageError(
			"--checkout takes a run id: rehearse show run:<name> --checkout <dir>",
		);
	}

	return parsed;
}

/**
 * The caller owns the directory they named and the harness never removes one,
 * so writing into a directory that is already there could bury work. Git would
 * refuse a non-empty one anyway; refusing here says why.
 */
async function refuseExistingDirectory(directory: string): Promise<void> {
	if (!(await exists(directory))) {
		return;
	}

	throw new RefusedPreconditionError(
		`${directory} already exists; --checkout writes a worktree into a new directory`,
	);
}

/**
 * The two ways `--checkout` can find nothing, told apart. A repository that
 * moved still holds the candidate under its retention ref, so its caller is
 * sent to find the repository; only a readable repository without the ref
 * means the run retained nothing and has to be re-run.
 */
async function refuseUnretainedRun(
	sourceRoot: string,
	reference: string,
	run: string,
): Promise<void> {
	if (await retainsCandidate(sourceRoot, reference)) {
		return;
	}

	throw new RefusedPreconditionError(
		`No ${reference} in ${sourceRoot}; run ${run} retained no candidate there`,
	);
}

async function retainsCandidate(
	sourceRoot: string,
	reference: string,
): Promise<boolean> {
	try {
		return await refExists(sourceRoot, reference);
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot read the target repository at ${sourceRoot} this run recorded; the candidate may still be retained wherever it is now: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
