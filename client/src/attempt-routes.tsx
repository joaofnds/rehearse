import { createRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ComparisonPage } from "#client/comparison/comparison-page";
import ComparisonsPage from "#client/comparison/comparisons-page";
import { unknownAsAbsent } from "#client/run-detail/run-detail-search";
import GroupWorkspacePage from "#client/run-history/group-workspace";
import AttemptWorkspacePage from "#client/session-history/attempt-workspace";

import { rootRoute } from "./section-routes";

const comparisonsRoute = createRoute({
	component: ComparisonsPage,
	getParentRoute: () => rootRoute,
	path: "/comparisons",
});

const comparisonRoute = createRoute({
	component: ComparisonRoute,
	getParentRoute: () => rootRoute,
	path: "/comparisons/$digest",
});

const ATTEMPT_SEARCH = z.object({
	comparison: z.string().optional(),
	step: z.string().optional(),
	view: z.union([z.enum(["results", "context"]), unknownAsAbsent]).optional(),
});

const sessionAttemptRoute = createRoute({
	component: SessionAttemptRoute,
	getParentRoute: () => rootRoute,
	path: "/attempts/session/$caseId/$uuid",
	validateSearch: ATTEMPT_SEARCH,
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
	comparison: z.string().optional(),
	step: z.string().optional(),
	view: z.union([z.enum(["results", "attempts"]), unknownAsAbsent]).optional(),
});

const groupWorkspaceRoute = createRoute({
	component: GroupWorkspaceRoute,
	getParentRoute: () => rootRoute,
	path: "/groups/$groupId",
	validateSearch: GROUP_SEARCH,
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
	component: ConfirmationAttemptRoute,
	getParentRoute: () => rootRoute,
	path: "/groups/$groupId/reps/$repId/attempt",
	validateSearch: ATTEMPT_SEARCH,
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

const replayHistoryRoute = createRoute({
	component: ReplayHistoryRoute,
	getParentRoute: () => rootRoute,
	path: "/replays/$lineage/$timestamp",
	validateSearch: ATTEMPT_SEARCH,
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

export {
	comparisonRoute,
	comparisonsRoute,
	confirmationAttemptRoute,
	groupWorkspaceRoute,
	replayHistoryRoute,
	sessionAttemptRoute,
};
