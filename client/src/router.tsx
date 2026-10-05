import {
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { CalibrationPage } from "#client/calibration/calibration-page";
import { StageReviewPage } from "#client/calibration/stage-review-page";
import { CasesPage } from "#client/cases/cases-page";
import { ComparisonPage } from "#client/comparison/comparison-page";
import { ComparisonsPage } from "#client/comparison/comparisons-page";
import { CorpusPage } from "#client/corpus/corpus-page";
import { EvidenceSourcePage } from "#client/evidence/evidence-source-page";
import { MonitorPage } from "#client/monitor/monitor-page";
import { RunDetailPage } from "#client/run-detail/run-detail-page";
import { RunHistoryPage } from "#client/run-history/run-history-page";
import { SettingsPage } from "#client/settings/settings-page";
import { SessionHistoryPage } from "#client/session-history/session-history-page";
import { AppShell } from "#client/shell/app-shell";
import { NotFoundPage } from "#client/shell/not-found-page";
import { SystemPage } from "#client/system/system-page";
import { TasksPage } from "#client/tasks/tasks-page";

const rootRoute = createRootRoute({
	component: AppShell,
	notFoundComponent: NotFoundPage,
});

const runHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: RunHistoryPage,
});

const monitorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/monitor",
	component: NewestMonitorRoute,
});

function NewestMonitorRoute(): React.JSX.Element {
	return <MonitorPage run={undefined} />;
}

const runMonitorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/monitor/$run",
	component: RunMonitorRoute,
});

function RunMonitorRoute(): React.JSX.Element {
	const params: { readonly run: string } = runMonitorRoute.useParams();

	return <MonitorPage run={params.run} />;
}

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

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsPage,
});

const comparisonsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/comparisons",
	component: ComparisonsPage,
});

const tasksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/tasks",
	component: TasksPage,
});

const casesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/cases",
	component: CasesPage,
});

const calibrationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calibration",
	component: CalibrationPage,
});

const runStageReviewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calibration/runs/$run/stages/$stage",
	component: RunStageReviewRoute,
});

function RunStageReviewRoute(): React.JSX.Element {
	const params: { readonly run: string; readonly stage: string } =
		runStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "run", ...params }} />;
}

const repStageReviewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calibration/groups/$groupId/reps/$repId/stages/$stage",
	component: RepStageReviewRoute,
});

function RepStageReviewRoute(): React.JSX.Element {
	const params: {
		readonly groupId: string;
		readonly repId: string;
		readonly stage: string;
	} = repStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "rep", ...params }} />;
}

const replayStageReviewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/calibration/replays/$lineage/$timestamp",
	component: ReplayStageReviewRoute,
});

function ReplayStageReviewRoute(): React.JSX.Element {
	const params: { readonly lineage: string; readonly timestamp: string } =
		replayStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "replay", ...params }} />;
}

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

const runDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run",
	component: RunDetailRoute,
});

function RunDetailRoute(): React.JSX.Element {
	const params: { readonly run: string } = runDetailRoute.useParams();

	return <RunDetailPage run={params.run} />;
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

const stageEvidenceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run/stages/$stage/evidence/$section/$item/$index",
	component: StageEvidenceRoute,
});

function StageEvidenceRoute(): React.JSX.Element {
	const params: {
		readonly run: string;
		readonly stage: string;
		readonly section: string;
		readonly item: string;
		readonly index: string;
	} = stageEvidenceRoute.useParams();

	return <EvidenceSourcePage identity={{ kind: "stage", ...params }} />;
}

const finalEvidenceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run/final/evidence/$item/$index",
	component: FinalEvidenceRoute,
});

function FinalEvidenceRoute(): React.JSX.Element {
	const params: {
		readonly run: string;
		readonly item: string;
		readonly index: string;
	} = finalEvidenceRoute.useParams();

	return <EvidenceSourcePage identity={{ kind: "final", ...params }} />;
}

const replayHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/replays/$lineage/$timestamp",
	component: ReplayHistoryRoute,
});

function ReplayHistoryRoute(): React.JSX.Element {
	const params: { readonly lineage: string; readonly timestamp: string } =
		replayHistoryRoute.useParams();

	return <SessionHistoryPage identity={{ kind: "replay", ...params }} />;
}

function ComparisonRoute(): React.JSX.Element {
	const params: { readonly digest: string } = comparisonRoute.useParams();

	return <ComparisonPage digest={params.digest} />;
}

const routeTree = rootRoute.addChildren([
	runHistoryRoute,
	monitorRoute,
	runMonitorRoute,
	runDetailRoute,
	stageHistoryRoute,
	stageEvidenceRoute,
	finalEvidenceRoute,
	replayHistoryRoute,
	systemRoute,
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
