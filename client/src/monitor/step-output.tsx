import StepOutputs from "#client/run-detail/step-outputs";

import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import JudgeSummary from "./step-activity-links";
import OperateOnStep from "./step-operations";

/** What came out of the stage, its judge, and what can be done with it. */
interface WhatCameOutProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
}

function WhatCameOut({
	run,
	record,
	stage,
}: WhatCameOutProps): React.JSX.Element {
	return (
		<section aria-label="What came out">
			<StepOutputs stage={stage} />
			<JudgeSummary run={run} stage={stage.stage} />
			<OperateOnStep run={run} record={record} stage={stage.stage} />
		</section>
	);
}

export { WhatCameOut as default };
