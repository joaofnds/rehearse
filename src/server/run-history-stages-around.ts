import type { PipelineStages } from "#server/run-history-contract";

const UNLISTED_STAGE_REASON =
	"the source pipeline does not list the stage replayed";

/**
 * The stages a record's replayed stages sit among, refused when they do not
 * list one, since that stage could then be placed nowhere among them.
 */
function stagesAround(
	replayed: readonly string[],
	stages: readonly string[],
): PipelineStages {
	if (!replayed.every((stage) => stages.includes(stage))) {
		return { reasons: [UNLISTED_STAGE_REASON], state: "unavailable" };
	}

	return { stages, state: "available" };
}

export { UNLISTED_STAGE_REASON, stagesAround };
