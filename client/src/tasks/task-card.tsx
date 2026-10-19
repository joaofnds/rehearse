import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { NO_RUNS, runsCounted, runsLeftOut } from "#client/latest-version-runs";
import plural from "#client/plural";
import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";

import EditStepsDialog from "./edit-steps-dialog";
import type { PipelinesResponse } from "./pipelines-query";

const NO_RECORDED_RESULTS = 0;

const NO_TASK_JUDGES = 0;

const NO_EXCLUDED_RECORDS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

type ListedTask = PipelinesResponse["pipelines"][number];

function runsLine({ figures }: ListedTask): string {
	if (figures.counted + figures.leftOut === NO_RECORDED_RESULTS) {
		return NO_RUNS;
	}

	return runsCounted(figures.counted, figures.corpusVersion);
}

function targetOf({ declaredBy, targets }: ListedTask): string {
	if (declaredBy !== null) {
		return declaredBy.target;
	}

	if (targets.length === EMPTY_COLLECTION_LENGTH) {
		return "No declared case names its target";
	}

	return targets.join(", ");
}

function figuresLine(task: ListedTask): string {
	const taskJudge =
		task.taskJudges === NO_TASK_JUDGES ? "no final judge" : "1 final judge";
	const judges = `${plural(task.stageJudges, "step judge")} + ${taskJudge}`;

	return [runsLine(task), plural(task.cases.length, "case"), judges].join(
		" · ",
	);
}

const OVERRIDE_DESCRIPTION =
	"A run chose this workflow over its case's default. No case declares it, so it has no final judge of its own.";

interface OpenGraphProps {
	readonly runInFlight: string | undefined;
	readonly reasonId: string;
}

function OpenGraph({
	runInFlight,
	reasonId,
}: OpenGraphProps): React.JSX.Element {
	if (runInFlight !== undefined) {
		return (
			<Button asChild variant="quiet">
				<Link to="/monitor/$run" params={{ run: runInFlight }}>
					Open graph
				</Link>
			</Button>
		);
	}

	return (
		<Button variant="quiet" aria-disabled="true" aria-describedby={reasonId}>
			Open graph
		</Button>
	);
}

/**
 * Open graph goes to the monitor for the task's newest run in flight. The
 * bare monitor would show whichever run is newest, which may belong to
 * another task, so with none of this task's runs in flight it is disabled.
 */
interface TaskCardProps {
	readonly task: ListedTask;
	readonly runInFlight: string | undefined;
}

function TaskCard({ task, runInFlight }: TaskCardProps): React.JSX.Element {
	const headingId = useId();
	const reasonId = useId();

	return (
		<article
			aria-labelledby={headingId}
			className="flex min-w-0 flex-col gap-5 rounded-lg border border-divider bg-card p-6"
		>
			<TaskCardReading task={task} headingId={headingId} />
			{task.declaredBy === null ? (
				<p className="max-w-prose text-14 leading-reading">
					{OVERRIDE_DESCRIPTION}
				</p>
			) : null}
			<div className="flex min-w-0 flex-col gap-2">
				<p className="font-mono text-12 text-dim wrap-anywhere">{task.path}</p>
				{task.cases.length === EMPTY_COLLECTION_LENGTH ? null : (
					<p className="text-12 text-dim wrap-anywhere">
						Used by: {task.cases.join(", ")}
					</p>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-2 border-t border-divider pt-4">
				<h3 className="text-12 font-medium text-muted-foreground">Steps</h3>
				<p className="text-14 wrap-anywhere">{task.stages.join(" → ")}</p>
			</div>
			<footer className="flex min-w-0 flex-col gap-3">
				{runInFlight === undefined ? (
					<p id={reasonId} className="text-12 text-dim">
						None of this workflow's runs is in flight
					</p>
				) : null}
				<ActionGroup>
					<OpenGraph runInFlight={runInFlight} reasonId={reasonId} />
					{task.declaredBy === null ? null : (
						<EditStepsDialog
							caseId={task.declaredBy.id}
							trigger={<Button variant="quiet">Edit steps</Button>}
						/>
					)}
				</ActionGroup>
			</footer>
		</article>
	);
}

interface TaskCardReadingProps {
	readonly task: ListedTask;
	readonly headingId: string;
}

function TaskCardReading({
	task,
	headingId,
}: TaskCardReadingProps): React.JSX.Element {
	return (
		<header className="flex min-w-0 flex-col gap-2">
			<h2 id={headingId} className="text-16 font-semibold wrap-anywhere">
				{task.declaredBy?.title ?? `${task.stages.join(" → ")} workflow`}
			</h2>
			<p className="text-14 text-muted-foreground wrap-anywhere">
				{targetOf(task)}
			</p>
			<p className="text-12 leading-reading text-dim wrap-anywhere">
				{figuresLine(task)}
			</p>
			{task.figures.leftOut > NO_EXCLUDED_RECORDS ? (
				<p className="text-12 text-dim">{runsLeftOut(task.figures.leftOut)}</p>
			) : null}
		</header>
	);
}

export { TaskCard as default };
export type { ListedTask };
