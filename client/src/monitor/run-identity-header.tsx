import {
	ControlRequests,
	stopTargetOf,
	usePauseRun,
	useStop,
} from "#client/run-history/run-controls";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Button } from "#client/system/ui/button";

/** As many of the commit's characters as the design shows. */
const COMMIT_SHOWN = 6;

export function shortCommit(commit: string): string {
	return commit.slice(0, COMMIT_SHOWN);
}

export function HeaderControls({
	row,
}: {
	readonly row: PipelineRow;
}): React.JSX.Element {
	const pause = usePauseRun();
	const stop = useStop();

	return (
		<span className="ml-auto flex flex-col items-end gap-1.5">
			<span className="flex gap-2.5">
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
			</span>
			<ControlRequests
				pauseRequested={pause.isSuccess}
				stopRequested={stop.isSuccess}
				refusal={(stop.error ?? pause.error)?.message}
			/>
		</span>
	);
}
