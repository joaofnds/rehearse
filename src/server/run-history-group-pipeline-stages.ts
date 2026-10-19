import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { unhandled } from "#benchmark/contracts";
import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { frozenPipeline } from "#benchmark/staleness-report";
import type { PipelineStages } from "#server/run-history-contract";
import { stagesAround } from "#server/run-history-stages-around";

const NO_FROZEN_PIPELINE_REASON =
	"the group froze no pipeline, which names its stages";

const UNREADABLE_FROZEN_PIPELINE_REASON =
	"the pipeline the group froze is missing or unreadable";

const SESSION_PIPELINE_REASON =
	"a session group repeats one session and runs no pipeline";

/**
 * A pipeline group repeats its whole pipeline, so its declared stages are
 * that pipeline's. A stage group's sit among the stages of the pipeline it
 * froze, read from its own inputs rather than the case's current pipeline.
 */
async function groupPipelineStages(
	runsDirectory: string,
	record: Immutable<ParsedConfirmationGroupRecord>,
): Promise<PipelineStages> {
	switch (record.mode) {
		case "pipeline": {
			return { stages: record.declaredStages, state: "available" };
		}
		case "session": {
			return { reasons: [SESSION_PIPELINE_REASON], state: "unavailable" };
		}
		case "stage": {
			if (!record.inputs.files.some(({ kind }) => kind === "pipeline")) {
				return { reasons: [NO_FROZEN_PIPELINE_REASON], state: "unavailable" };
			}

			const pipeline = await frozenPipeline(
				confirmationGroupPaths(runsDirectory, record.groupId).directory,
				record.inputs.files,
			).catch((): undefined => undefined);
			if (pipeline === undefined) {
				return {
					reasons: [UNREADABLE_FROZEN_PIPELINE_REASON],
					state: "unavailable",
				};
			}

			return stagesAround(
				record.declaredStages,
				pipeline.stages.map(({ name }) => name),
			);
		}
		default: {
			return unhandled(record, "confirmation mode");
		}
	}
}

export {
	NO_FROZEN_PIPELINE_REASON,
	UNREADABLE_FROZEN_PIPELINE_REASON,
	SESSION_PIPELINE_REASON,
	groupPipelineStages,
};
