import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import type { SessionCase } from "./case";
import { gradeStateEvidence } from "./state-scorer-execution";
import type { StateScorerOutcome } from "./state-scorer-output";

/**
 * The scorer is declared inline rather than as a file beside `case.json`
 * because `sessionUpstreamDigest` walks the fixture subdirectory and not the
 * case directory: a scorer file there would be covered by no digest, so a
 * session that edited it could be graded as the original definition. Declared
 * here, the command and its outcomes fold into the lineage digest with the
 * prompt and tools, and a confirmation run freezes `case.json` bodily.
 *
 * A scorer complex enough to need its own file is a command that invokes one
 * inside the fixture, which the fixture digest already covers.
 */
const stateCheckSchema = z
	.object({
		command: z.array(z.string().nonempty()).nonempty(),
		outcomes: z
			.array(z.string().nonempty())
			.nonempty()
			.refine(
				(names) => new Set(names).size === names.length,
				"declares the same outcome more than once",
			),
	})
	.strict();

type StateCheck = z.infer<typeof stateCheckSchema>;

/**
 * Grading a case's declared scorer against preserved evidence, in a restore
 * that exists only for this grade. The original attempt and a later regrade
 * both come through here, so the temporary directory's lifetime and the
 * scorer's source are stated once: a second copy of them would let one path
 * grade in the evidence itself while the other graded in a copy.
 *
 * A case declaring no scorer grades no state, which the caller sees as
 * `undefined` rather than as an empty result list. That is a different fact
 * from a scorer that ran and reported nothing.
 */
async function gradeCaseState(
	sessionCase: Readonly<
		Pick<SessionCase, "stateCheck"> & {
			readonly fixturePath: string | undefined;
		}
	>,
	evidenceDirectory: string,
): Promise<StateScorerOutcome | undefined> {
	const { stateCheck } = sessionCase;
	if (stateCheck === undefined) {
		return undefined;
	}

	const restoreDirectory = await mkdtemp(join(tmpdir(), "rehearse-grade-"));
	try {
		return await gradeStateEvidence({
			command: stateCheck.command,
			evidenceDirectory,
			outcomes: stateCheck.outcomes,
			restoreDirectory,
			scorerSource: sessionCase.fixturePath,
		});
	} finally {
		await rm(restoreDirectory, { force: true, recursive: true });
	}
}

export { stateCheckSchema, gradeCaseState };
export type { StateCheck };
export {
	stateResultSchema,
	parseStateScorerOutput,
} from "./state-scorer-output";
export {
	STATE_SCORER_TIMEOUT_MS,
	scorerFiles,
	gradeStateEvidence,
} from "./state-scorer-execution";
export type {
	StateResult,
	StateResults,
	StateGradingError,
	StateScorerOutcome,
} from "./state-scorer-output";
export type { StateGradingRequest } from "./state-scorer-execution";
