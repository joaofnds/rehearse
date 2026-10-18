import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import { runsInFlight } from "#client/shell/run-in-flight";
import { Notice } from "#client/system/components/notice";
import { ActionGroup } from "#client/system/components/action-group";
import { EmptyState } from "#client/system/components/empty-state";
import { ScreenHeader } from "#client/system/components/screen-header";
import { Button } from "#client/system/ui/button";
import { pipelinesQuery } from "./pipelines-query";
import { ExportTaskDialog, ImportTaskDialog } from "./task-bundle-dialogs";
import { TaskCard } from "./task-card";

function WorkflowEmptyState({
	loaded,
	count,
	caseId,
	unreadable,
}: {
	readonly loaded: boolean;
	readonly count: number;
	readonly caseId: string | undefined;
	readonly unreadable: number;
}): React.JSX.Element | null {
	if (!loaded || count > 0) {
		return null;
	}

	if (caseId !== undefined) {
		return (
			<p className="text-14 text-muted-foreground">
				No workflow definition is recorded for this case.
			</p>
		);
	}

	if (unreadable > 0) {
		return null;
	}

	return (
		<EmptyState heading="No workflows yet">
			<p>
				Workflow cases supply reusable steps and judges. Browse cases to declare
				one, or import a workflow bundle above.
			</p>
			<Button asChild variant="outline">
				<Link to="/cases" search={{}}>
					Browse cases
				</Link>
			</Button>
		</EmptyState>
	);
}

/**
 * The tasks are read once, and a run started after that is on no card until
 * they are read again. They are re-read each time the polled history still
 * shows a run in flight that no card holds, so Open graph reaches it once its
 * manifest names its pipeline.
 */
export function TasksPage({
	embedded = false,
	caseId,
}: {
	readonly embedded?: boolean;
	readonly caseId?: string;
}): React.JSX.Element {
	const query = useQuery(pipelinesQuery);
	const tasks = query.data?.pipelines ?? [];
	const visibleTasks =
		caseId === undefined
			? tasks
			: tasks.filter((task) => task.cases.includes(caseId));
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
			{embedded ? null : (
				<ScreenHeader
					title="Workflows"
					subline="Reusable step definitions for workflow cases"
					aside={
						<ActionGroup>
							<ImportTaskDialog onImported={setImportedPath} />
							<ExportTaskDialog tasks={tasks} />
						</ActionGroup>
					}
				/>
			)}

			<div className="flex max-w-7xl flex-col gap-6 page-gutter pt-8 pb-12">
				{embedded ? (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0 wrap-anywhere">
							<h2 className="text-16 font-semibold">Workflow definitions</h2>
							{caseId === undefined ? null : (
								<p className="text-12 text-muted-foreground">
									Showing workflows used by{" "}
									<span className="font-mono">{caseId}</span>
									{" · "}
									<Link
										to="/cases"
										search={{ view: "workflows" }}
										className="text-link hover:underline"
									>
										All workflows
									</Link>
								</p>
							)}
						</div>
						<ActionGroup>
							<ImportTaskDialog onImported={setImportedPath} />
							<ExportTaskDialog tasks={visibleTasks} />
						</ActionGroup>
					</div>
				) : null}
				<p className="max-w-prose text-14 text-muted-foreground">
					A workflow defines steps and their judges. Its final judge evaluates
					the whole output. Export a definition with its judges to import it as
					a case in another checkout.
				</p>

				{importedPath === undefined ? null : (
					<p role="status" className="text-14 text-secondary-foreground">
						{`Imported ${importedPath}. It is uncommitted: review and commit it to keep the case.`}
					</p>
				)}

				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-attention">
						<span aria-hidden="true">⚠ </span>
						Could not load the workflows.
					</p>
				) : null}

				{unreadable.length > 0 ? (
					<Notice
						message="These records could not be read, so no card shows what they hold:"
						items={unreadable.map(({ id, reason }) => `${id}: ${reason}`)}
					/>
				) : null}
				<WorkflowEmptyState
					loaded={query.isSuccess}
					count={visibleTasks.length}
					caseId={caseId}
					unreadable={unreadable.length}
				/>

				{visibleTasks.map((task) => (
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
