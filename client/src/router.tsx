import {
	createRootRoute,
	createRoute,
	createRouter,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { z } from "zod";
import { CalibrationPage } from "#client/calibration/calibration-page";
import { StageReviewPage } from "#client/calibration/stage-review-page";
import { CasesPage } from "#client/cases/cases-page";
import { ComparisonPage } from "#client/comparison/comparison-page";
import { ComparisonsPage } from "#client/comparison/comparisons-page";
import { CorpusPage } from "#client/corpus/corpus-page";
import { corpusSearchSchema } from "#client/corpus/corpus-search";
import type { CorpusSearch } from "#client/corpus/corpus-search";
import { EvidenceSourcePage } from "#client/evidence/evidence-source-page";
import { MonitorPage } from "#client/monitor/monitor-page";
import { NewestRunDetail } from "#client/run-detail/newest-run-detail";
import { RunDetailPage } from "#client/run-detail/run-detail-page";
import type { RunDetailSearch } from "#client/run-detail/run-detail-search";
import {
	runDetailSearchSchema,
	unknownAsAbsent,
} from "#client/run-detail/run-detail-search";
import { GroupWorkspacePage } from "#client/run-history/group-workspace";
import { runDiscoverySearchSchema } from "#client/run-history/run-discovery";
import { RunHistoryPage } from "#client/run-history/run-history-page";
import { AttemptWorkspacePage } from "#client/session-history/attempt-workspace";
import { SettingsPage } from "#client/settings/settings-page";
import { AppShell } from "#client/shell/app-shell";
import { NotFoundPage } from "#client/shell/not-found-page";
import { TasksPage } from "#client/tasks/tasks-page";

const rootRoute = createRootRoute({
	component: AppShell,
	notFoundComponent: NotFoundPage,
});

/**
 * Any value of `invalidatedBy` reaches the screen as text, so one that names
 * no edit is answered there rather than failing the route.
 */
const RUN_HISTORY_SEARCH = runDiscoverySearchSchema.extend({
	invalidatedBy: z.coerce.string().optional(),
});

const runHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	validateSearch: RUN_HISTORY_SEARCH,
	component: RunHistoryRoute,
});

function RunHistoryRoute(): React.JSX.Element {
	const search: z.output<typeof RUN_HISTORY_SEARCH> =
		runHistoryRoute.useSearch();

	return (
		<RunHistoryPage invalidatedBy={search.invalidatedBy} discovery={search} />
	);
}

const monitorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/monitor",
	component: NewestMonitorRoute,
});

function NewestMonitorRoute(): React.JSX.Element {
	return <MonitorPage />;
}

const runMonitorRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/monitor/$run",
	component: RunMonitorRoute,
});

function RunMonitorRoute(): React.JSX.Element {
	const params: { readonly run: string } = runMonitorRoute.useParams();

	return <RunDetailPage run={params.run} search={{ view: "activity" }} />;
}

const corpusRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/corpus",
	validateSearch: corpusSearchSchema,
	component: CorpusRoute,
});

function CorpusRoute(): React.JSX.Element {
	const { file, start, end, sourceRun, sourceStep }: CorpusSearch =
		corpusRoute.useSearch();
	const lines = start === undefined ? undefined : { start, end: end ?? start };

	return (
		<CorpusPage
			key={`${file}:${sourceRun}:${sourceStep}`}
			opened={file === undefined ? undefined : { path: file, lines }}
			source={
				sourceRun === undefined || sourceStep === undefined
					? undefined
					: { run: sourceRun, stage: sourceStep }
			}
		/>
	);
}

const SECTION_SEARCH = z.object({
	view: z.string().optional(),
	caseId: z.string().optional(),
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	validateSearch: SECTION_SEARCH,
	component: SettingsRoute,
});

function SettingsRoute(): React.JSX.Element {
	const { view }: z.output<typeof SECTION_SEARCH> = settingsRoute.useSearch();
	return <SettingsPage view={view === "judges" ? "judges" : "general"} />;
}

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

const CASES_SEARCH = SECTION_SEARCH.extend({
	corpusVersion: z.string().optional(),
});

const casesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/cases",
	validateSearch: CASES_SEARCH,
	component: CasesRoute,
});

function CasesRoute(): React.JSX.Element {
	const { view, caseId, corpusVersion }: z.output<typeof CASES_SEARCH> =
		casesRoute.useSearch();
	return (
		<CasesPage
			view={view === "workflows" ? "workflows" : "cases"}
			{...(caseId === undefined ? {} : { caseId })}
			{...(corpusVersion === undefined ? {} : { corpusVersion })}
		/>
	);
}

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

const ATTEMPT_SEARCH = z.object({
	step: z.string().optional(),
	comparison: z.string().optional(),
	view: z.union([z.enum(["results", "context"]), unknownAsAbsent]).optional(),
});

const sessionAttemptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/attempts/session/$caseId/$uuid",
	validateSearch: ATTEMPT_SEARCH,
	component: SessionAttemptRoute,
});

function SessionAttemptRoute(): React.JSX.Element {
	const params: { readonly caseId: string; readonly uuid: string } =
		sessionAttemptRoute.useParams();

	const search: z.output<typeof ATTEMPT_SEARCH> =
		sessionAttemptRoute.useSearch();
	return (
		<AttemptWorkspacePage
			identity={{ kind: "standalone", ...params }}
			view={search.view ?? "results"}
			step={search.step}
			comparison={search.comparison}
		/>
	);
}

const GROUP_SEARCH = z.object({
	view: z.union([z.enum(["results", "attempts"]), unknownAsAbsent]).optional(),
	step: z.string().optional(),
	comparison: z.string().optional(),
});

const groupWorkspaceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/groups/$groupId",
	validateSearch: GROUP_SEARCH,
	component: GroupWorkspaceRoute,
});

function GroupWorkspaceRoute(): React.JSX.Element {
	const params: { readonly groupId: string } = groupWorkspaceRoute.useParams();
	const search: z.output<typeof GROUP_SEARCH> = groupWorkspaceRoute.useSearch();
	return (
		<GroupWorkspacePage
			groupId={params.groupId}
			view={search.view ?? "results"}
			comparison={search.comparison}
			step={search.step}
		/>
	);
}

const confirmationAttemptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/groups/$groupId/reps/$repId/attempt",
	validateSearch: ATTEMPT_SEARCH,
	component: ConfirmationAttemptRoute,
});

function ConfirmationAttemptRoute(): React.JSX.Element {
	const params: { readonly groupId: string; readonly repId: string } =
		confirmationAttemptRoute.useParams();

	const search: z.output<typeof ATTEMPT_SEARCH> =
		confirmationAttemptRoute.useSearch();
	return (
		<AttemptWorkspacePage
			identity={{ kind: "confirmation", ...params }}
			view={search.view ?? "results"}
			step={search.step}
			comparison={search.comparison}
		/>
	);
}

const newestRunDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs",
	component: NewestRunDetail,
});

const runDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run",
	validateSearch: runDetailSearchSchema,
	component: RunDetailRoute,
});

function RunDetailRoute(): React.JSX.Element {
	const params: { readonly run: string } = runDetailRoute.useParams();
	const search: RunDetailSearch = runDetailRoute.useSearch();

	return <RunDetailPage run={params.run} search={search} />;
}

const stageHistoryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/runs/$run/stages/$stage",
	component: StageHistoryRoute,
});

function StageHistoryRoute(): React.JSX.Element {
	const params: { readonly run: string; readonly stage: string } =
		stageHistoryRoute.useParams();

	return (
		<RunDetailPage
			run={params.run}
			search={{ view: "context", step: params.stage }}
		/>
	);
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
	validateSearch: ATTEMPT_SEARCH,
	component: ReplayHistoryRoute,
});

function ReplayHistoryRoute(): React.JSX.Element {
	const params: { readonly lineage: string; readonly timestamp: string } =
		replayHistoryRoute.useParams();

	const search: z.output<typeof ATTEMPT_SEARCH> =
		replayHistoryRoute.useSearch();
	return (
		<AttemptWorkspacePage
			identity={{ kind: "replay", ...params }}
			view={search.view ?? "results"}
			step={search.step}
			comparison={search.comparison}
		/>
	);
}

function ComparisonRoute(): React.JSX.Element {
	const params: { readonly digest: string } = comparisonRoute.useParams();

	return <ComparisonPage digest={params.digest} />;
}

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
