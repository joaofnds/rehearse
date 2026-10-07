import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import { Button } from "#client/system/ui/button";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";

/**
 * A task-graph node's `in / out` action and the step modal it opens (SPEC.md
 * 2c and 3): what went into the stage, what came out, its judge, and the
 * operations on it.
 */
export function StepModalAction({
	stage,
}: {
	readonly run: string;
	readonly record: RunRecordResponse;
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="quiet"
					size="xs"
					aria-label={`${stage.stage} — instructions in, artifacts out`}
				>
					in / out ▸
				</Button>
			</DialogTrigger>
			<DialogContent width="wide">
				<DialogTitle>{stage.stage}</DialogTitle>
			</DialogContent>
		</Dialog>
	);
}
