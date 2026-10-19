import JudgePane from "./judge-pane";
import type { MonitoredStage } from "./run-record-query";
import SessionPane from "./session-pane";

/**
 * The session and judge panes (SPEC.md 2d), named after the stage they
 * follow.
 */
interface StagePanesProps {
	readonly run: string;
	readonly number: number;
	readonly stage: MonitoredStage;
}

function StagePanes({
	run,
	number,
	stage,
}: StagePanesProps): React.JSX.Element {
	return (
		<div className="grid min-h-0 flex-1 basis-0 grid-cols-1 grid-rows-2 lg:grid-cols-monitor-panes lg:grid-rows-1">
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

export { StagePanes as default };
