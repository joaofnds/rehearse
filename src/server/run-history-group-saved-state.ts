import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import type { SessionGroupSavedState } from "#server/run-history-contract";
import readRepSavedState from "#server/run-history-read-rep-saved-state";

const NO_FAILED_RESULTS = 0;

async function sessionGroupSavedState(
	runsDirectory: string,
	group: Immutable<ParsedConfirmationGroupRecord>,
): Promise<SessionGroupSavedState> {
	const readings = await Promise.all(
		group.repRecords.map(
			async ({ repId }) => await readRepSavedState(runsDirectory, group, repId),
		),
	);
	const assessed = readings.flatMap(({ assessment }) =>
		assessment.state === "assessed" ? [assessment] : [],
	);
	const passed = assessed.filter(
		(assessment) => assessment.failed === NO_FAILED_RESULTS,
	).length;

	return {
		assessed: assessed.length,
		disagreements: readings.filter(
			({ assessment, recordedPassed }) =>
				assessment.state === "assessed" &&
				recordedPassed !== undefined &&
				(assessment.failed === NO_FAILED_RESULTS) !== recordedPassed,
		).length,
		failed: assessed.length - passed,
		passed,
		total: group.reps,
		unavailable: group.reps - assessed.length,
		unavailableReps: readings.flatMap(({ repId, assessment }) =>
			assessment.state === "unavailable"
				? [{ reason: assessment.reason, repId }]
				: [],
		),
	};
}

export { sessionGroupSavedState as default };
