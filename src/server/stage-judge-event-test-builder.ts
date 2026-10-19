import type { Immutable } from "#benchmark/contracts";
import type { NewRunEvent } from "#benchmark/run-events";
import RunEventBuilder from "#benchmark/run-events-event-test-builder";
import { RUN } from "#server/stage-judge-test-fixture";

class StageJudgeEventBuilder extends RunEventBuilder {
	public constructor(props: Immutable<Partial<NewRunEvent>> = {}) {
		super({ runId: RUN, stage: "build", ...props });
	}
}

export { StageJudgeEventBuilder as default };
