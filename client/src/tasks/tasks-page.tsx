import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import { runsInFlight } from "#client/shell/run-in-flight";
import { Notice } from "#client/system/components/notice";
import { ScreenHeader } from "#client/system/components/screen-header";
import { pipelinesQuery } from "./pipelines-query";
import { ExportTaskDialog, ImportTaskDialog } from "./task-bundle-dialogs";
import { TaskCard } from "./task-card";

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
	const history = useQuery(polledRunListingQuery);
	const inFlight = runsInFlight(history.data?.rows ?? []);
	const onNoCard =
		query.isSuccess &&
		inFlight.some(({ run }) => !tasks.some((task) => task.runs.includes(run)));
	const { refetch } = query;
	const [importedPath, setImportedPath] = useState<string>();

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
				aside={
					<span className="flex gap-2.5">
						<ImportTaskDialog onImported={setImportedPath} />
						<ExportTaskDialog tasks={tasks} />
					</span>
				}
			/>

			<div className="flex max-w-7xl flex-col gap-6 px-6 pt-4 pb-12">
				<p className="max-w-prose text-sm text-muted-foreground">
					A step is judged on what went into it and what came out. A task is
					judged from the first input and the last artifact only, so the same
					work as four steps and as one step produce comparable task grades. A
					task exports with its judges as one file, which another checkout
					imports as a new case.
				</p>

				{importedPath === undefined ? null : (
					<p role="status" className="text-sm text-secondary-foreground">
						{`Imported ${importedPath}. It is uncommitted: review and commit it to keep the case.`}
					</p>
				)}

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
