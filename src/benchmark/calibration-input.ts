import { CommandError } from "./command";
import type { HumanReview } from "./contracts";
import { humanReviewSchema } from "./contracts";

class CalibrationIncompleteError extends Error {
	public override name = "CalibrationIncompleteError";
}

async function asCalibrationInput<T>(
	operation: () => T | Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (
			error instanceof CommandError ||
			error instanceof CalibrationIncompleteError ||
			error instanceof TypeError ||
			error instanceof ReferenceError ||
			error instanceof RangeError
		) {
			throw error;
		}

		throw new CalibrationIncompleteError(
			error instanceof Error ? error.message : String(error),
			{ cause: error },
		);
	}
}

function parseHumanReview(review: string): HumanReview {
	try {
		return humanReviewSchema.parse(JSON.parse(review));
	} catch (error) {
		throw new CalibrationIncompleteError(
			error instanceof Error ? error.message : String(error),
			{ cause: error },
		);
	}
}

export { CalibrationIncompleteError, asCalibrationInput, parseHumanReview };
