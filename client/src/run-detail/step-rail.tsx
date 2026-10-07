import { isPaused } from "#benchmark/stopped-status";
import type {
	MonitoredStage,
	RunRecordResponse,
} from "#client/monitor/run-record-query";
import type { NodeStatus } from "#client/monitor/task-graph";
import {
	costReading,
	durationReading,
	nodeStatus,
} from "#client/monitor/task-graph";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { Grade } from "#client/system/components/grade";
import { LiveGlyph, STATUS_VOCABULARY } from "#client/system/components/status";

/** How a stage reads in the rail: as the task graph reads it, unless the run ended before it. */
function railStatus(stage: MonitoredStage, row: PipelineRow): NodeStatus {
	const ended = row.progress.state !== "running" && !isPaused(row.status);
	if (ended && stage.status === "no-record") {
		return { state: "queued", words: "never ran" };
	}

	return nodeStatus(stage, row);
}

/** The checkpoint the stage saved, its wall time and its cost. */
function railMeta(stage: MonitoredStage, row: PipelineRow): string {
	return [
		...(stage.checkpointShortId.state === "available"
			? [stage.checkpointShortId.shortId]
			: []),
		durationReading(stage, row, Date.now()),
		costReading(stage, row),
	].join(" · ");
}

function StepButton({
	stage,
	number,
	row,
	selected,
	onSelect,
}: {
	readonly stage: MonitoredStage;
	readonly number: number;
	readonly row: PipelineRow;
	readonly selected: boolean;
	readonly onSelect: (stage: string) => void;
}): React.JSX.Element {
	const status = railStatus(stage, row);

	return (
		<li>
			<button
				type="button"
				aria-current={selected ? "step" : undefined}
				onClick={() => {
					onSelect(stage.stage);
				}}
				className={`w-full rounded-card border px-2.5 py-2.25 text-left ${selected ? "border-primary bg-selected" : "border-border"}`}
			>
				<span className="flex items-center gap-2">
					<span aria-hidden="true" className="font-mono text-10-5 text-dim">
						{String(number).padStart(2, "0")}
					</span>
					<span className="flex-1 text-12-5">{stage.stage}</span>
					<Grade
						size="inline"
						value={
							stage.grade.state === "available"
								? { letter: stage.grade.letter }
								: { pending: true }
						}
					/>
				</span>
				<span className="mt-1 flex items-center gap-1.5 text-11 text-muted-foreground">
					{status.state === "running" ? (
						<LiveGlyph tone="surrounding" />
					) : (
						<span aria-hidden="true">
							{STATUS_VOCABULARY[status.state].glyph}
						</span>
					)}
					{status.words}
				</span>
				{status.words === "never ran" ? null : (
					<span className="mt-0.75 block font-mono text-10-5 text-dim">
						{railMeta(stage, row)}
					</span>
				)}
			</button>
		</li>
	);
}

/**
 * Step rail (SPEC.md 4a): the run's stages down the left, and the selected
 * stage's report beside them.
 */
export function StepRail({
	row,
	record,
	selected,
	onSelect,
}: {
	readonly row: PipelineRow;
	readonly record: RunRecordResponse;
	readonly selected: string;
	readonly onSelect: (stage: string) => void;
}): React.JSX.Element {
	const number = record.stages.findIndex((each) => each.stage === selected) + 1;

	return (
		<div className="grid min-h-0 flex-1 grid-cols-step-rail">
			<section
				aria-label="Steps"
				className="overflow-y-auto border-r border-divider px-2.5 py-3"
			>
				<h2 className="px-1.5 pb-2 text-10 tracking-label text-dim uppercase">
					Steps &amp; checkpoints
				</h2>
				<ul aria-label="Steps and checkpoints" className="flex flex-col gap-1">
					{record.stages.map((stage, index) => (
						<StepButton
							key={stage.stage}
							stage={stage}
							number={index + 1}
							row={row}
							selected={stage.stage === selected}
							onSelect={onSelect}
						/>
					))}
				</ul>
			</section>
			<section
				aria-label="Step report"
				className="overflow-y-auto px-5 pt-4 pb-8"
			>
				<h2 className="text-15">
					Step {String(number)} · {selected}
				</h2>
			</section>
		</div>
	);
}
