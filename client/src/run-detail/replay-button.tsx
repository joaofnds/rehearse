import { LaunchDialog } from "#client/launch/launch-dialog";
import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { Button } from "#client/system/ui/button";

/**
 * A replay starts from the checkpoint the stage before it saved, so a stage
 * whose predecessor saved none has nothing to replay from. The first stage
 * starts from the run's initial checkpoint, which the launch checks.
 */
export function consumedCheckpointMissing(
	record: RunRecordResponse,
	stage: string,
): boolean {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return index > 0 && record.stages[index - 1]?.checkpoint === "missing";
}

export function ReplayButton({
	run,
	record,
	stage,
	label,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: string;
	readonly label: string;
}): React.JSX.Element {
	if (consumedCheckpointMissing(record, stage)) {
		return (
			<Button
				variant="default"
				size="compact"
				aria-disabled="true"
				aria-label={`${label}: ${stage} has no checkpoint to replay from`}
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
