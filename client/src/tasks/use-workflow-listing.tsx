import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { polledRunListingQuery } from "#client/run-history/run-history-polling";
import type { PipelineRow } from "#client/shell/run-in-flight";
import { runsInFlight } from "#client/shell/run-in-flight";

import type { PipelinesResponse } from "./pipelines-query";
import pipelinesQuery from "./pipelines-query";
import type { ListedTask } from "./task-card";

interface WorkflowListing {
	readonly tasks: readonly ListedTask[];
	readonly visibleTasks: readonly ListedTask[];
	readonly unreadable: PipelinesResponse["unreadable"];
	readonly inFlight: readonly PipelineRow[];
	readonly loading: boolean;
	readonly failed: boolean;
	readonly loaded: boolean;
}

function useWorkflowListing(caseId: string | undefined): WorkflowListing {
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

	useEffect(() => {
		if (onNoCard) {
			void refetch();
		}
	}, [onNoCard, refetch, history.dataUpdatedAt]);

	return {
		failed: query.isError,
		inFlight,
		loaded: query.isSuccess,
		loading: query.isLoading,
		tasks,
		unreadable,
		visibleTasks,
	};
}

export { useWorkflowListing as default };
export type { WorkflowListing };
