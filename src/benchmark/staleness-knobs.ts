import { effortCause, modelCause } from "./checkpoint";
import type { ReplayRecord } from "./replay-record";
import type { CurrentSessionKnobs } from "./staleness-contract";

/**
 * A model or effort the caller names that differs from the one the record ran
 * with. An unnamed knob asserts nothing, as it does for a checkpoint.
 */
function namedKnobCauses(
	record: Pick<ReplayRecord, "model" | "effort">,
	knobs: CurrentSessionKnobs,
): readonly string[] {
	const causes: string[] = [];
	if (knobs.model !== undefined && knobs.model !== record.model) {
		causes.push(modelCause(record.model, knobs.model));
	}
	if (knobs.effort !== undefined && knobs.effort !== record.effort) {
		causes.push(effortCause(record.effort, knobs.effort));
	}

	return causes;
}

export { namedKnobCauses as default };
