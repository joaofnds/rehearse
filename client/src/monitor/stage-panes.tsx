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
	ended = false,
}: {
	readonly run: string;
	readonly number: number;
	readonly stage: MonitoredStage;
	readonly ended?: boolean;
}): React.JSX.Element {
	return (
		<div
			className={`grid grid-cols-monitor-panes overflow-x-auto ${ended ? "min-h-0 items-start" : "min-h-70.75 flex-1 basis-0"}`}
		>
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
