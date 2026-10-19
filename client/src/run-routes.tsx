import { createRoute } from "@tanstack/react-router";
import { z } from "zod";

import MonitorPage from "#client/monitor/monitor-page";
import NewestRunDetail from "#client/run-detail/newest-run-detail";
import RunDetailPage from "#client/run-detail/run-detail-page";
import type { RunDetailSearch } from "#client/run-detail/run-detail-search";
import { runDetailSearchSchema } from "#client/run-detail/run-detail-search";
import { runDiscoverySearchSchema } from "#client/run-history/run-discovery";
import RunHistoryPage from "#client/run-history/run-history-page";

import { rootRoute } from "./section-routes";

/**
 * Any value of `invalidatedBy` reaches the screen as text, so one that names
 * no edit is answered there rather than failing the route.
 */
const RUN_HISTORY_SEARCH = runDiscoverySearchSchema.extend({
	invalidatedBy: z.coerce.string().optional(),
});

const runHistoryRoute = createRoute({
	component: RunHistoryRoute,
	getParentRoute: () => rootRoute,
	path: "/",
	validateSearch: RUN_HISTORY_SEARCH,
});

function RunHistoryRoute(): React.JSX.Element {
	const search: z.output<typeof RUN_HISTORY_SEARCH> =
		runHistoryRoute.useSearch();

	return (
		<RunHistoryPage invalidatedBy={search.invalidatedBy} discovery={search} />
	);
}

const monitorRoute = createRoute({
	component: NewestMonitorRoute,
	getParentRoute: () => rootRoute,
	path: "/monitor",
});

function NewestMonitorRoute(): React.JSX.Element {
	return <MonitorPage />;
}

const runMonitorRoute = createRoute({
	component: RunMonitorRoute,
	getParentRoute: () => rootRoute,
	path: "/monitor/$run",
});

function RunMonitorRoute(): React.JSX.Element {
	const params: { readonly run: string } = runMonitorRoute.useParams();

	return <RunDetailPage run={params.run} search={{ view: "activity" }} />;
}

const newestRunDetailRoute = createRoute({
	component: NewestRunDetail,
	getParentRoute: () => rootRoute,
	path: "/runs",
});

const runDetailRoute = createRoute({
	component: RunDetailRoute,
	getParentRoute: () => rootRoute,
	path: "/runs/$run",
	validateSearch: runDetailSearchSchema,
});

function RunDetailRoute(): React.JSX.Element {
	const params: { readonly run: string } = runDetailRoute.useParams();
	const search: RunDetailSearch = runDetailRoute.useSearch();

	return <RunDetailPage run={params.run} search={search} />;
}

const stageHistoryRoute = createRoute({
	component: StageHistoryRoute,
	getParentRoute: () => rootRoute,
	path: "/runs/$run/stages/$stage",
});

function StageHistoryRoute(): React.JSX.Element {
	const params: { readonly run: string; readonly stage: string } =
		stageHistoryRoute.useParams();

	return (
		<RunDetailPage
			run={params.run}
			search={{ step: params.stage, view: "context" }}
		/>
	);
}

export {
	monitorRoute,
	newestRunDetailRoute,
	runDetailRoute,
	runHistoryRoute,
	runMonitorRoute,
	stageHistoryRoute,
};
