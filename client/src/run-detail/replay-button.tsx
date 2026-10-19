import { LaunchDialog } from "#client/launch/launch-dialog";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { stageReplayRefusal } from "#client/monitor/run-record-query";
import { Button } from "#client/system/ui/button";

interface ReplayButtonProps {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
	readonly label: string;
}

function ReplayButton({
	run,
	record,
	stage,
	label,
}: ReplayButtonProps): React.JSX.Element {
	const refusal = stageReplayRefusal(record, stage);
	if (refusal !== undefined) {
		return (
			<Button
				variant="default"
				size="compact"
				aria-disabled="true"
				aria-label={`${label}: ${refusal}`}
			>
				{label}
			</Button>
		);
	}

	return (
		<LaunchDialog
			target={{ kind: "replay", run, stage }}
			trigger={
				<Button variant="default" size="compact">
					{label}
				</Button>
			}
		/>
	);
}

export { ReplayButton as default };
