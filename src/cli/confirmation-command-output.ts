import type { CommandOutput } from "#cli/output";

import type { RunOutcome } from "./run-command-contracts";

interface ConfirmationCommandEvidence {
	readonly groupRecordFile: string;
	readonly repRecordFiles: readonly string[];
	readonly reportFile: string;
}
function reportConfirmationOutcome(
	output: CommandOutput,
	outcome: ConfirmationCommandEvidence,
): RunOutcome {
	output.stderr(`Confirmation group: ${outcome.groupRecordFile}\n`);
	for (const recordFile of outcome.repRecordFiles) {
		output.stderr(`Confirmation rep: ${recordFile}\n`);
	}

	return { kind: "confirmation", recordFile: outcome.reportFile };
}
export { reportConfirmationOutcome as default };
