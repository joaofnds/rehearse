import { Link } from "@tanstack/react-router";
import { useId } from "react";
import {
	runsCounted as runsCountedAt,
	runsLeftOut,
} from "#client/latest-version-runs";
import { plural } from "#client/plural";
import { Button } from "#client/system/ui/button";
import type { PipelinesResponse } from "./pipelines-query";

export type ListedTask = PipelinesResponse["pipelines"][number];

export const NOT_WIRED_REASON = "Not wired yet";

function runsCounted({ figures }: ListedTask): string {
	if (figures.counted + figures.leftOut === 0) {
		return "No runs yet";
	}

	return runsCountedAt(figures.counted, figures.corpusVersion);
}

function targetOf({ declaredBy, targets }: ListedTask): string {
	if (declaredBy !== null) {
		return declaredBy.target;
	}

	if (targets.length === 0) {
		return "No declared case names its target";
	}

	return targets.join(", ");
}

function figuresLine(task: ListedTask): string {
	const taskJudge = task.taskJudges === 0 ? "no task judge" : "1 task judge";
	const judges = `${plural(task.stageJudges, "step judge")} + ${taskJudge}`;

	return [runsCounted(task), plural(task.cases.length, "case"), judges].join(
		" · ",
	);
}

const OVERRIDE_DESCRIPTION =
	"A run chose this pipeline over its case's default. No case declares it, so it has no task judge of its own.";

function OpenGraph({
	runInFlight,
}: {
	readonly runInFlight: string | undefined;
}): React.JSX.Element {
	const reasonId = useId();

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
		<>
			<span id={reasonId} className="text-11-5 text-dim">
				None of this task's runs is in flight
			</span>
			<Button variant="quiet" aria-disabled="true" aria-describedby={reasonId}>
				Open graph
			</Button>
		</>
	);
}

/**
 * Open graph goes to the monitor for the task's newest run in flight. The
 * bare monitor would show whichever run is newest, which may belong to
 * another task, so with none of this task's runs in flight it is disabled.
 */
export function TaskCard({
	task,
	runInFlight,
}: {
	readonly task: ListedTask;
	readonly runInFlight: string | undefined;
}): React.JSX.Element {
	const headingId = useId();
	const reasonId = useId();

	return (
		<article
			aria-labelledby={headingId}
			className="rounded-lg border border-divider bg-card px-4 py-3.5"
		>
			<div className="flex flex-wrap items-center gap-3">
				<h2 id={headingId} className="font-mono text-sm">
					{task.path}
				</h2>
				<span className="text-11-5 text-muted-foreground">
					{targetOf(task)}
				</span>
				<span className="ml-auto font-mono text-11 text-dim">
					{figuresLine(task)}
				</span>
			</div>
			{task.figures.leftOut > 0 ? (
				<p className="mt-1 text-right font-mono text-11 text-dim">
					{runsLeftOut(task.figures.leftOut)}
				</p>
			) : null}
			<p className="mt-2 max-w-prose text-sm">
				{task.declaredBy?.title ?? OVERRIDE_DESCRIPTION}
			</p>
			<div className="mt-2.5 flex flex-wrap items-center gap-2.5">
				<span className="text-xs tracking-widest text-dim uppercase">
					Steps
				</span>
				<span className="font-mono text-11-5">{task.stages.join(" → ")}</span>
				<span className="ml-auto flex items-center gap-2">
					<OpenGraph runInFlight={runInFlight} />
					<span id={reasonId} className="text-11-5 text-dim">
						{NOT_WIRED_REASON}
					</span>
					<Button
						variant="quiet"
						aria-disabled="true"
						aria-describedby={reasonId}
					>
						Edit steps
					</Button>
				</span>
			</div>
		</article>
	);
}
