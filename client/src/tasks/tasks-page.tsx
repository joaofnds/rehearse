import { useId } from "react";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";

const NOT_WIRED_REASON = "Not wired in v0.6";

function HeaderControls(): React.JSX.Element {
	const reasonId = useId();

	return (
		<span className="flex flex-col items-end gap-1.5">
			<span className="flex gap-2.5">
				<Button
					variant="quiet"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Import a task
				</Button>
				<Button
					variant="quiet"
					aria-disabled="true"
					aria-describedby={reasonId}
				>
					Export with judges
				</Button>
			</span>
			<span id={reasonId} className="text-11-5 text-dim">
				{NOT_WIRED_REASON}
			</span>
		</span>
	);
}

export function TasksPage(): React.JSX.Element {
	return (
		<div>
			<ScreenHeader
				title="Tasks"
				subline="A task is a chain of steps against a base repository · declared as the pipeline file a case names, or chosen by a run"
				aside={<HeaderControls />}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				<p className="max-w-prose text-sm text-muted-foreground">
					A step is judged on what went into it and what came out. A task is
					judged from the first input and the last artifact only, so the same
					work as four steps and as one step produce comparable task grades.
					Import and export are drawn but not wired in v0.6.
				</p>
			</div>
		</div>
	);
}
