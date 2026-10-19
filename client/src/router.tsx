import type { RouterHistory } from "@tanstack/react-router";
import { createRouter } from "@tanstack/react-router";

import stringifyRouteSearch from "#client/route-search";

import {
	comparisonRoute,
	comparisonsRoute,
	confirmationAttemptRoute,
	groupWorkspaceRoute,
	replayHistoryRoute,
	sessionAttemptRoute,
} from "./attempt-routes";
import { finalEvidenceRoute, stageEvidenceRoute } from "./evidence-routes";
import {
	calibrationRoute,
	repStageReviewRoute,
	replayStageReviewRoute,
	runStageReviewRoute,
} from "./review-routes";
import {
	monitorRoute,
	newestRunDetailRoute,
	runDetailRoute,
	runHistoryRoute,
	runMonitorRoute,
	stageHistoryRoute,
} from "./run-routes";
import {
	casesRoute,
	corpusRoute,
	rootRoute,
	settingsRoute,
	tasksRoute,
} from "./section-routes";

const routeTree = rootRoute.addChildren([
	runHistoryRoute,
	monitorRoute,
	runMonitorRoute,
	newestRunDetailRoute,
	runDetailRoute,
	stageHistoryRoute,
	stageEvidenceRoute,
	finalEvidenceRoute,
	replayHistoryRoute,
	corpusRoute,
	comparisonsRoute,
	comparisonRoute,
	tasksRoute,
	casesRoute,
	calibrationRoute,
	settingsRoute,
	runStageReviewRoute,
	repStageReviewRoute,
	replayStageReviewRoute,
	sessionAttemptRoute,
	confirmationAttemptRoute,
	groupWorkspaceRoute,
]);

interface CreateAppRouterOptions {
	readonly history?: RouterHistory | undefined;
}

function createAppRouter(
	options?: CreateAppRouterOptions,
): ReturnType<typeof createRouter<typeof routeTree>> {
	const shared = {
		routeTree,
		scrollRestoration: true,
		scrollToTopSelectors: ['[data-scroll-restoration-id="workspace"]'],
		stringifySearch: stringifyRouteSearch,
	};

	return options?.history === undefined
		? createRouter(shared)
		: createRouter({ ...shared, history: options.history });
}

export { createAppRouter as default };
export type { CreateAppRouterOptions };
