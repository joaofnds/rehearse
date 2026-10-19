import { CalibrationIncompleteError, calibrate } from "#benchmark/calibration";
import type { CalibrationResult } from "#benchmark/contracts";
import type { SpendCeiling } from "#benchmark/spend-ceiling";
import { createSpendCeiling } from "#benchmark/spend-ceiling";
import type { CommandOutput } from "#cli/output";

import type { CalibrateJudges, JudgeKnobs } from "./calibration-judges";
import { judgeKnobsOf } from "./calibration-record-evidence";
import type { CalibrationInputs } from "./calibration-session-input";

/**
 * The `calibrate` command: it rejudges the frozen evidence with the rubrics and
 * instructions as they stand now, validates the findings, and records the
 * result. It asks nothing. `--confirm-rejudge` stands in for the typed yes the
 * paused loop asks for, and is required exactly where that question was asked:
 * when a rejudge produced a revised result the caller has not seen.
 *
 * Each invocation pays for its own rejudge, so confirming one costs the Judge
 * calls twice. That is the price of the two-invocation protocol rather than an
 * oversight: the rubrics and instructions are read fresh each time, and a
 * grade cached from the first invocation would let the caller confirm a result
 * the current corpus no longer produces, which is what the confirmation
 * exists to prevent. A cache would have to be invalidated on exactly the
 * inputs the rejudge already reads, so it would buy nothing a third read
 * does not.
 */
interface CalibrateDependencies {
	readonly output: CommandOutput;
	readonly buildJudges: (
		knobs: Readonly<JudgeKnobs>,
		spendCeiling: SpendCeiling,
	) => CalibrateJudges;
	readonly probeModel: (model: string) => Promise<void>;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
}

interface CalibrationRejudgeRequest {
	readonly input: CalibrationInputs;
	readonly runsDirectory: string;
}

async function rejudgeCalibration(
	request: CalibrationRejudgeRequest,
	dependencies: Readonly<CalibrateDependencies>,
): Promise<CalibrationResult> {
	const { input, runsDirectory } = request;
	const { buildJudges, output, probeModel, requireSpendCeiling } = dependencies;
	const knobs = judgeKnobsOf(input.record);
	const spendCeiling = createSpendCeiling({
		ceilingUsd: await requireSpendCeiling(runsDirectory),
	});

	await probeModel(knobs.judgeModel);
	const judges = buildJudges(knobs, spendCeiling);
	return await reportIncomplete(
		output,
		async () =>
			await calibrate(
				{ current: input.current, frozen: input.frozen, review: input.review },
				{ finalJudge: judges.finalJudge, stageJudge: judges.stageJudge },
			),
	);
}

/**
 * A calibration that does not hold is the caller's answer, not a stack trace:
 * the message says which finding the evidence contradicts, and the artifact
 * stays where it was so the next review can correct it.
 */
async function reportIncomplete(
	output: CommandOutput,
	work: () => Promise<CalibrationResult>,
): Promise<CalibrationResult> {
	try {
		return await work();
	} catch (error) {
		if (error instanceof CalibrationIncompleteError) {
			output.stderr(`Calibration incomplete: ${error.message}\n`);
		}

		throw error;
	}
}

export { rejudgeCalibration as default };

export type { CalibrateDependencies };
