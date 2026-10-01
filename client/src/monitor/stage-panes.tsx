import { JudgePane } from "./judge-pane";
import type { MonitoredStage } from "./run-record-query";
import { SessionPane } from "./session-pane";

/**
 * The session and judge panes (SPEC.md 2d), named after the stage they
 * follow.
 */
export function StagePanes({
	run,
	number,
	stage,
}: {
	readonly run: string;
	readonly number: number;
	readonly stage: MonitoredStage;
}): React.JSX.Element {
	return (
		<div className="grid min-h-70.75 flex-1 basis-2/5 grid-cols-monitor-panes overflow-x-auto">
			<SessionPane
				key={`session ${stage.stage}`}
				run={run}
				number={number}
				figures={stage}
			/>
			<JudgePane
				key={`judge ${stage.stage}`}
				run={run}
				number={number}
				figures={stage}
			/>
		</div>
	);
}
