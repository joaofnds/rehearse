import {
	ControlRequests,
	stopTargetOf,
	usePauseRun,
	useStop,
} from "#client/run-history/run-controls";
import type { PipelineRow } from "#client/shell/run-in-flight";
import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";

interface HeaderControlsProps {
	readonly row: PipelineRow;
}

function HeaderControls({ row }: HeaderControlsProps): React.JSX.Element {
	const pause = usePauseRun();
	const stop = useStop();

	return (
		<div className="flex min-w-0 max-w-full flex-col items-start gap-2 sm:items-end">
			<ActionGroup>
				<Button
					variant="quiet"
					disabled={pause.isPending || pause.isSuccess}
					onClick={() => {
						pause.mutate(row.run);
					}}
				>
					Pause after this step
				</Button>
				<Button
					variant="destructive"
					disabled={stop.isPending || stop.isSuccess}
					onClick={() => {
						stop.mutate(stopTargetOf(row.launchId, row.run));
					}}
				>
					Stop &amp; restore repo
				</Button>
			</ActionGroup>
			<ControlRequests
				pauseRequested={pause.isSuccess}
				stopRequested={stop.isSuccess}
				refusal={(stop.error ?? pause.error)?.message}
			/>
		</div>
	);
}

export { HeaderControls as default };
