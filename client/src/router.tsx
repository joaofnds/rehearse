import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { ComparisonPage } from "#client/comparison/comparison-page";
import { CorpusPage } from "#client/corpus/corpus-page";
import { RunHistoryPage } from "#client/run-history/run-history-page";
import { SessionHistoryPage } from "#client/session-history/session-history-page";
import { SystemPage } from "#client/system/system-page";

const rootRoute = createRootRoute({
	component: () => <Outlet />,
});

const runHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: RunHistoryPage,
});

const systemRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/system",
	component: SystemPage,
});

const corpusRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/corpus",
	component: CorpusPage,
});

const comparisonRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/comparisons/$digest",
	component: ComparisonRoute,
});

const sessionAttemptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/attempts/session/$caseId/$uuid",
	component: SessionAttemptRoute,
});

function SessionAttemptRoute(): React.JSX.Element {
	const params: { readonly caseId: string; readonly uuid: string } =
		sessionAttemptRoute.useParams();

	return <SessionHistoryPage identity={{ kind: "standalone", ...params }} />;
}

const confirmationAttemptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/groups/$groupId/reps/$repId/attempt",
	component: ConfirmationAttemptRoute,
});

function ConfirmationAttemptRoute(): React.JSX.Element {
	const params: { readonly groupId: string; readonly repId: string } =
		confirmationAttemptRoute.useParams();

	return <SessionHistoryPage identity={{ kind: "confirmation", ...params }} />;
}

const stageHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run/stages/$stage",
	component: StageHistoryRoute,
});

function StageHistoryRoute(): React.JSX.Element {
	const params: { readonly run: string; readonly stage: string } =
		stageHistoryRoute.useParams();

	return <SessionHistoryPage identity={{ kind: "stage", ...params }} />;
}

function ComparisonRoute(): React.JSX.Element {
	const params: { readonly digest: string } = comparisonRoute.useParams();

	return <ComparisonPage digest={params.digest} />;
}

const routeTree = rootRoute.addChildren([
	runHistoryRoute,
	stageHistoryRoute,
	systemRoute,
	corpusRoute,
	comparisonRoute,
	sessionAttemptRoute,
	confirmationAttemptRoute,
]);

export interface CreateAppRouterOptions {
	readonly history?: RouterHistory | undefined;
}

export function createAppRouter(
	options?: CreateAppRouterOptions,
): ReturnType<typeof createRouter<typeof routeTree>> {
	return options?.history === undefined
		? createRouter({ routeTree })
		: createRouter({ routeTree, history: options.history });
}
