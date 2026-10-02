import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import { runsInFlight } from "#client/shell/run-in-flight";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import { pipelinesQuery } from "./pipelines-query";
import { NOT_WIRED_REASON } from "#client/not-wired";
import { TaskCard } from "./task-card";

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

/**
 * The tasks are read once, and a run started after that is on no card until
 * they are read again. They are re-read each time the polled history still
 * shows a run in flight that no card holds, so Open graph reaches it once its
 * manifest names its pipeline.
 */
export function TasksPage(): React.JSX.Element {
	const query = useQuery(pipelinesQuery);
	const tasks = query.data?.pipelines ?? [];
	const unreadable = query.data?.unreadable ?? [];
	const history = useQuery(polledRunHistoryQuery);
	const inFlight = runsInFlight(history.data?.rows ?? []);
	const onNoCard =
		query.isSuccess &&
		inFlight.some(({ run }) => !tasks.some((task) => task.runs.includes(run)));
	const { refetch } = query;

	useEffect(() => {
		if (onNoCard) {
			void refetch();
		}
	}, [onNoCard, refetch, history.dataUpdatedAt]);

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

				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-muted-foreground">
						<span aria-hidden="true">⚠ </span>
						Could not load the tasks.
					</p>
				) : null}

				{unreadable.length > 0 ? (
					<Notice
						message="These records could not be read, so no card shows what they hold:"
						items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
					/>
				) : null}

				{tasks.map((task) => (
					<TaskCard
						key={task.path}
						task={task}
						runInFlight={
							inFlight.find(({ run }) => task.runs.includes(run))?.run
						}
					/>
				))}
			</div>
		</div>
	);
}
