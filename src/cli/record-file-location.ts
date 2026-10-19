import { caseDeclarationPath, casesRoot } from "#benchmark/case";
import { displayPath } from "#benchmark/config";
import { unhandled } from "#benchmark/contracts";
import {
	benchmarkRunPaths,
	checkpointRecordFile,
	comparisonReportPaths,
	confirmationGroupPaths,
	replayRecordFile,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import { stoppedStage } from "#benchmark/run-outcome";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { RecordId } from "#cli/record-id";

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
): Promise<string> {
	const paths = benchmarkRunPaths(runsDirectory, id.run);
	if (await Bun.file(paths.artifactFile).exists()) {
		return paths.artifactFile;
	}

	const stopped = await stoppedStage(runsDirectory, id.run);

	return stopped === undefined
		? paths.artifactFile
		: paths.stageFile(stopped.stage);
}

function checkpointFileFor(
	id: Extract<RecordId, { kind: "checkpoint" }>,
	runsDirectory: string,
): string {
	const paths = benchmarkRunPaths(runsDirectory, id.run);
	return checkpointRecordFile(paths.checkpointDirectory(id.stage));
}

async function recordFileFor(
	id: RecordId,
	runsDirectory: string,
): Promise<string> {
	switch (id.kind) {
		case "run": {
			return await runRecordFile(id, runsDirectory);
		}
		case "case": {
			return caseDeclarationPath(id.caseId, casesRoot());
		}

		case "checkpoint": {
			return checkpointFileFor(id, runsDirectory);
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

		case "rep:stage":
		case "rep:session": {
			return id.kind === "rep:stage"
				? confirmationGroupPaths(runsDirectory, id.groupId)
						.rep(id.repId)
						.stageFile(id.stage)
				: confirmationGroupPaths(runsDirectory, id.groupId).rep(id.repId)
						.attemptFile;
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
interface RecordTextRequest {
	readonly id: string;
	readonly file: string;
}
async function recordText({ id, file }: RecordTextRequest): Promise<string> {
	const record = Bun.file(file);
	if (!(await record.exists())) {
		throw new RefusedPreconditionError(
			`No record ${id} at ${displayPath(file)}`,
		);
	}

	return await record.text();
}

export { recordFileFor, recordText };
