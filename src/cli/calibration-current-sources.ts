import type {
	CurrentCalibrationSources,
	FrozenCalibrationEvidence,
} from "#benchmark/calibration";
import { readStageRubrics } from "#benchmark/calibration";
import { caseRelative, readCaseDeclaration } from "#benchmark/case";
import { liveCorpusInstructions } from "#benchmark/corpus-file";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

interface CalibrationSourceRequest {
	readonly readCurrentSources?:
		| ((caseId: string | undefined) => Promise<CurrentControlSources>)
		| undefined;
}

interface CurrentCalibrationRequest extends CalibrationSourceRequest {
	readonly frozen: Readonly<FrozenCalibrationEvidence>;
	readonly caseId: string | undefined;
}

interface CurrentControlSources {
	readonly instructions: string;
	readonly finalRubric: string;
}

/**
 * The rubric text a stage is rejudged against is read from the path the
 * scorecard recorded, not one recomputed from the case: an edit lands in the
 * file the run graded from, and that is the file this reads back.
 *
 * A rubric the command cannot read is refused, for the same reason an
 * unreadable case is: reading it as absent means the stage is not rejudged,
 * which the record then states as a rubric that did not change. The paused
 * loop re-prompts on the same read, so anything else would leave the two
 * paths disagreeing about a recorded result.
 */
async function currentSources(
	request: Readonly<CurrentCalibrationRequest>,
): Promise<CurrentCalibrationSources> {
	const { frozen, caseId } = request;
	const read =
		request.readCurrentSources ??
		(async (id: string | undefined) =>
			await readControlSources(id, frozen.finalRubric));
	const { instructions, finalRubric } = await read(caseId);
	const stageRubrics = await readStageRubrics(
		frozen.stageScorecards,
		readStageRubricText,
	);

	return { finalRubric, instructions, stageRubrics };
}

async function readStageRubricText(path: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot read the stage rubric this run graded against at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * The final rubric a run is rejudged against is the one its case declares, read
 * through the case id the artifact recorded. Only the declaration is read, not
 * the loaded case: calibration touches no target repository, and a case whose
 * target has moved must still calibrate. A run that recorded no case is
 * rejudged against the rubric it froze, because there is no other rubric to
 * compare it with.
 *
 * A case the artifact names but the reader cannot read is refused. Answering
 * it with the frozen rubric reads as "the rubric did not change", which
 * discards the reviewer's edit, skips the final rejudge, and records the run
 * COMPLETE, all at exit 0 and with nothing said.
 */
async function readControlSources(
	caseId: string | undefined,
	frozenRubric: string,
): Promise<CurrentControlSources> {
	const instructions = await liveCorpusInstructions();
	if (caseId === undefined) {
		return { finalRubric: frozenRubric, instructions };
	}

	return { finalRubric: await readCaseFinalRubric(caseId), instructions };
}

async function readCaseFinalRubric(caseId: string): Promise<string> {
	const declaration = await refusing(
		caseId,
		async () => await readCaseDeclaration(caseId),
	);
	if (declaration.kind !== "pipeline") {
		throw new RefusedPreconditionError(
			`Cannot compare case ${caseId} with the rubric this run froze: it declares no final rubric`,
		);
	}

	return await refusing(
		caseId,
		async () =>
			await Bun.file(caseRelative(declaration, declaration.finalRubric)).text(),
	);
}

async function refusing<T>(caseId: string, read: () => Promise<T>): Promise<T> {
	try {
		return await read();
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot compare case ${caseId} with the rubric this run froze: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export { currentSources, readControlSources };

export type { CalibrationSourceRequest, CurrentControlSources };
