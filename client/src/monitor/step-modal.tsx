import {
	skillReading,
	stageCostReading,
	wallTimeReading,
} from "#client/run-detail/step-report";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";
import { endedStatus, hasEnded } from "./run-record-query";
import type { MonitoredStage, RunRecordResponse } from "./run-record-query";

/**
 * What the header says of the stage: its skill, wall time and cost as its
 * record keeps them, or pending while the stage has not ended.
 */
function figuresReading(stage: MonitoredStage): string {
	if (!hasEnded(stage)) {
		return "skill pending · wall time pending · cost pending";
	}

	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
	].join(" · ");
}

function verdictReading(stage: MonitoredStage): string {
	return hasEnded(stage)
		? STATUS_VOCABULARY[endedStatus(stage)].word
		: STATUS_VOCABULARY.pending.word;
}

function ModalHeader({
	stage,
	number,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
}): React.JSX.Element {
	return (
		<header className="flex flex-none flex-wrap items-center gap-3 border-b border-strong px-4 py-3">
			<span className="font-mono text-10 tracking-label text-dim uppercase">
				Step {String(number).padStart(2, "0")}
			</span>
			<DialogTitle>{stage.stage}</DialogTitle>
			<span className="font-mono text-11 text-muted-foreground">
				{figuresReading(stage)}
			</span>
			<span className="ml-auto flex items-center gap-2.25">
				<span className="text-11-5 text-secondary-foreground">
					verdict {verdictReading(stage)}
				</span>{" "}
				<Grade
					size="node"
					value={
						stage.grade.state === "available"
							? { letter: stage.grade.letter }
							: { pending: true }
					}
				/>
				<DialogClose asChild>
					<Button variant="outline" size="sm" aria-label="Close">
						Esc
					</Button>
				</DialogClose>
			</span>
		</header>
	);
}

/**
 * A task-graph node's `in / out` action and the step modal it opens (SPEC.md
 * 2c and 3): what went into the stage, what came out, its judge, and the
 * operations on it.
 */
export function StepModalAction({
	stage,
	number,
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
				<ModalHeader stage={stage} number={number} />
			</DialogContent>
		</Dialog>
	);
}
